// prisma/fix-google-name-leak.ts
// One-off remediation: scrub real first+last names that leaked from Google OAuth
// into public identity fields (username / displayName) and from User.name.
//
// Context: before the auth.ts privacy fix, a Google-first sign-in (scope only
// openid/email/profile — no handle) set username = slug(real name) and
// displayName = real name, exposing it in the public ranking/profile. The code
// fix stops NEW leaks; this script cleans EXISTING rows.
//
// Detection (precise, low false-positive): the user has a Google account AND
// User.name contains whitespace (a real "First Last" — platform handles never do).
//   - username is scrubbed ONLY if it equals slug(name) (i.e. it was auto-derived,
//     not a handle the user chose or one from Twitch/Discord/Kick).
//   - displayName is scrubbed ONLY if it equals the real name.
//   - User.name is always cleared for these users (defense in depth).
// New values come from the email local-part, mirroring the new auth.ts logic.
//
// Usage (run from ghost-empire-web/, hits the DB in .env):
//   npx tsx prisma/fix-google-name-leak.ts            # dry run (no writes)
//   npx tsx prisma/fix-google-name-leak.ts --apply    # apply + backup to temp dir
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Same transform as auth.ts username generation.
function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
}

type Change = {
  id: string;
  oldUsername: string | null;
  newUsername: string | null;
  oldDisplayName: string | null;
  newDisplayName: string | null;
  publicChanged: boolean;
};

async function main() {
  const googleUsers = await prisma.user.findMany({
    where: {
      accounts: { some: { provider: "google" } },
      name: { contains: " " }, // real first+last name; handles never contain spaces
    },
    select: { id: true, name: true, email: true, username: true, displayName: true },
  });

  // Existing usernames (lowercased) for uniqueness checks.
  const taken = new Set(
    (await prisma.user.findMany({ where: { username: { not: null } }, select: { username: true } }))
      .map((u) => u.username!.toLowerCase()),
  );

  function uniquify(base: string): string {
    const candidate = base || "ghost";
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    let i = 2;
    while (taken.has(`${candidate}_${i}`)) i++;
    const finalC = `${candidate}_${i}`;
    taken.add(finalC);
    return finalC;
  }

  const changes: Change[] = [];

  for (const u of googleUsers) {
    const realName = u.name!;
    const nameSlug = slugify(realName);
    const emailLocal = u.email?.split("@")[0] ?? "";
    let safeSlug = slugify(emailLocal);
    if (!safeSlug) safeSlug = `ghost_${u.id.slice(-6)}`;

    const usernameLeaked = u.username != null && u.username.toLowerCase() === nameSlug;
    const displayLeaked = u.displayName != null && u.displayName === realName;

    let newUsername = u.username;
    if (usernameLeaked) {
      if (u.username) taken.delete(u.username.toLowerCase()); // free the old before reassigning
      newUsername = uniquify(safeSlug);
    }
    let newDisplayName = u.displayName;
    if (displayLeaked) {
      newDisplayName = newUsername ?? safeSlug;
    }

    const publicChanged = u.username !== newUsername || u.displayName !== newDisplayName;
    changes.push({
      id: u.id,
      oldUsername: u.username,
      newUsername,
      oldDisplayName: u.displayName,
      newDisplayName,
      publicChanged,
    });
  }

  const usernameChanges = changes.filter((c) => c.oldUsername !== c.newUsername).length;
  const displayChanges = changes.filter((c) => c.oldDisplayName !== c.newDisplayName).length;
  const publicChanges = changes.filter((c) => c.publicChanged).length;

  console.log(`Google users with a full name stored : ${googleUsers.length}`);
  console.log(`  username scrubbed                   : ${usernameChanges}`);
  console.log(`  displayName scrubbed                : ${displayChanges}`);
  console.log(`  User.name cleared (all of them)     : ${changes.length}`);
  console.log(`  users whose PUBLIC identity changes : ${publicChanges} (these get a notification)`);

  if (!APPLY) {
    console.log("\nDRY RUN — nic nie zapisano. Uruchom z --apply aby zastosowac.");
    return;
  }

  // Backup to the OS temp dir (keeps real names OUT of the repo) before mutating.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = join(tmpdir(), `ghost-empire-google-name-backup-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(changes, null, 2), "utf8");
  console.log(`\nBackup (zawiera stare wartosci) zapisany: ${backupFile}`);

  let done = 0;
  for (const c of changes) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: c.id },
        data: {
          ...(c.oldUsername !== c.newUsername ? { username: c.newUsername } : {}),
          ...(c.oldDisplayName !== c.newDisplayName ? { displayName: c.newDisplayName } : {}),
          name: null,
        },
      });
      if (c.publicChanged) {
        await tx.notification.create({
          data: {
            userId: c.id,
            type: "system",
            title: "Twoja nazwa zostala zaktualizowana (prywatnosc)",
            message:
              "Ze wzgledow prywatnosci ukrylismy Twoje imie z konta Google. Mozesz ustawic wlasna nazwe w /profile.",
            icon: "🔒",
            link: "/profile",
          },
        });
      }
    });
    done++;
  }
  console.log(`Zaktualizowano ${done} uzytkownikow.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

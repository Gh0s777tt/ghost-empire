// src/types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin: boolean;
      isModerator: boolean;
      isDonator: boolean;
      tokens: number;
      level: number;
      username: string | null;
    };
  }

  interface User {
    isAdmin?: boolean;
    isModerator?: boolean;
    isDonator?: boolean;
    tokens?: number;
    level?: number;
    username?: string | null;
    discordId?: string | null;
  }
}

// src/types/next-auth.d.ts
// Auth.js v5 module augmentation. With the database session strategy the `session`
// callback receives an AdapterUser, so the custom fields must be declared on BOTH
// `next-auth` User and `next-auth/adapters` AdapterUser.
import "next-auth";
import "next-auth/adapters";

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

declare module "next-auth/adapters" {
  interface AdapterUser {
    isAdmin?: boolean;
    isModerator?: boolean;
    isDonator?: boolean;
    tokens?: number;
    level?: number;
    username?: string | null;
    discordId?: string | null;
  }
}

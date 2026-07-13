"use client";
// src/components/kasyno/shared.tsx — barrel. Prymitywy/logika/plansze rozbite na osobne
// moduły (audyt ETAP 1: God-component); ten plik re-eksportuje je, by importy `./shared`
// (KasynoClient) działały bez zmian.
export * from "./logic";
export * from "./boards/common";
export * from "./boards/games";

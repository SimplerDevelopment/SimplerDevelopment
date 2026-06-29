/// <reference types="nativewind/types" />

// Side-effect import of the Tailwind entry file in the root layout.
// NativeWind doesn't ship CSS module typings — declare it so tsc is happy.
declare module '*.css';

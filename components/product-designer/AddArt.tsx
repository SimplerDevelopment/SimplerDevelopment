'use client';

import React from "react";
import { ArtCategories } from "./ArtCategories";
import { ArtPicker } from "./ArtPicker";

export const AddArt = () => {
  const [view, setView] = React.useState("categories");
  return view === "categories" ? (
    <ArtCategories setView={setView} />
  ) : (
    <ArtPicker view={view} setView={setView} />
  );
  // return <ArtPicker view={view} setView={setView} />;
};

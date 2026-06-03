'use client';

import React from "react";
import { IconCategories } from "./IconCategories";
import { IconPicker } from "./IconPicker";

export const AddIcon = () => {
  const [view, setView] = React.useState("categories");
  return view === "categories" ? (
    <IconCategories setView={setView} />
  ) : (
    <IconPicker setView={setView} />
  );
};

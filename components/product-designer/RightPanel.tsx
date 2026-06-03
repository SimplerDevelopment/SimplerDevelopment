'use client';

import React from "react";
import { useContext } from "react";
import { EditorContext } from "./EditorContext";
import { FaRegCommentDots, FaPhoneAlt, FaEnvelope } from "react-icons/fa";

export const RightPanel = () => {
  const { style } = useContext(EditorContext);
  const sizes = style?.sizes || [];
  return (
    <div className="flex-1 p-2 bg-green-400 text-center text-white max-w-[150px] mx-auto">
      <div>
        <h3 className="text-4xl font-bold">
          We're <br /> Here To Help
        </h3>
        <div>
          <div className="flex flex-col items-center mt-4 gap-12">
            <FaRegCommentDots size={45} title="Chat" />
            <FaPhoneAlt size={45} title="Phone" />
            <FaEnvelope size={45} title="Email" />
          </div>
        </div>
      </div>
    </div>
  );
};

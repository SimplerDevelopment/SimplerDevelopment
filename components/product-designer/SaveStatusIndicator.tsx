'use client';

import React from 'react';
import { DesignState } from './EditorContext';
import { BsCheck, BsExclamationTriangle } from 'react-icons/bs';

interface SaveStatusIndicatorProps {
  designState: DesignState;
  className?: string;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ 
  designState, 
  className = "" 
}) => {
  const getStatusColor = () => {
    if (designState.isAutoSaving) return "text-blue-600";
    if (designState.hasUnsavedChanges) return "text-amber-600";
    if (designState.isSaved) return "text-green-600";
    return "text-gray-500";
  };

  const getStatusIcon = () => {
    if (designState.isAutoSaving) {
      return (
        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      );
    }
    if (designState.hasUnsavedChanges) {
      return <BsExclamationTriangle className="w-3 h-3" />;
    }
    if (designState.isSaved) {
      return <BsCheck className="w-3 h-3" />;
    }
    return null;
  };

  const getStatusText = () => {
    if (designState.isAutoSaving) return "Saving...";
    if (designState.hasUnsavedChanges) return "Unsaved changes";
    if (designState.isSaved && designState.lastSavedAt) {
      const timeSince = Date.now() - designState.lastSavedAt.getTime();
      const minutes = Math.floor(timeSince / 60000);
      if (minutes < 1) return "Saved just now";
      if (minutes === 1) return "Saved 1 minute ago";
      return `Saved ${minutes} minutes ago`;
    }
    if (designState.isSaved) return "All changes saved";
    return "Not saved";
  };

  return (
    <div className={`flex items-center gap-1.5 text-xs ${getStatusColor()} ${className}`}>
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  );
};

export default SaveStatusIndicator;
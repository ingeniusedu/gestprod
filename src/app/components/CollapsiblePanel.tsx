"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsiblePanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  initialOpen?: boolean;
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({ title, children, initialOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <div className="mb-2"> {/* Reduced margin-bottom */}
      <button
        className="flex justify-between items-center w-full py-2 px-2 text-left font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-md font-semibold">{title}</span> {/* Slightly smaller font for title */}
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {/* Smaller icons */}
      </button>
      {isOpen && (
        <div className="pt-2 pl-4"> {/* Removed border-t, adjusted padding */}
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsiblePanel;

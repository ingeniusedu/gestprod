import React from 'react';
import { ModeloRecipiente } from '../types/modeloRecipiente';

interface ModeloRecipienteThumbnailSelectorProps {
  modelos: ModeloRecipiente[];
  selectedModeloId: string | null;
  onSelect: (modeloId: string) => void;
}

const ModeloRecipienteThumbnailSelector: React.FC<ModeloRecipienteThumbnailSelectorProps> = ({
  modelos,
  selectedModeloId,
  onSelect,
}) => {
  const uniBasica = 20; // Define a basic unit in pixels

  return (
    <div className="flex flex-wrap gap-4 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
      {modelos.map((modelo) => (
        <div
          key={modelo.id}
          className={`cursor-pointer rounded-lg shadow-sm transition-all duration-200 relative overflow-hidden
            ${selectedModeloId === modelo.id ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-gray-600 bg-white hover:border-blue-300'}`}
          onClick={() => onSelect(modelo.id!)}
          style={{
            width: `${modelo.dimensoes.x * uniBasica}px`,
            height: `${modelo.dimensoes.y * uniBasica}px`,
            minWidth: '40px', // Adjusted minimum size
            minHeight: '40px', // Adjusted minimum size
            borderWidth: modelo.dimensoes.z === 1 ? '1px' : modelo.dimensoes.z === 2 ? '2px' : '3px', // Adjusted border thickness for Z
            borderColor: selectedModeloId === modelo.id ? '#3b82f6' : '#4b5563', // Darker border color
          }}
        >
          <div className="absolute top-0.5 left-0.5 right-0.5 text-center text-[0.5rem] font-medium text-gray-800 truncate">
            {modelo.nome}
          </div>
          <div className="absolute bottom-0.5 left-0.5 right-0.5 text-center text-[0.4rem] text-gray-500">
            {modelo.dimensoes.x}x{modelo.dimensoes.y}x{modelo.dimensoes.z}
          </div>

          {/* Visual representation of horizontal divisions */}
          {modelo.divisoes && modelo.divisoes.horizontais > 1 && (
            Array.from({ length: modelo.divisoes.horizontais - 1 }).map((_, i) => (
              <div
                key={`h-div-${i}`}
                className="absolute bg-gray-300" // Slightly darker for visibility
                style={{
                  height: '1px',
                  width: '100%',
                  top: `${((i + 1) / modelo.divisoes!.horizontais) * 100}%`,
                }}
              ></div>
            ))
          )}
          {/* Visual representation of vertical divisions */}
          {modelo.divisoes && modelo.divisoes.verticais > 1 && (
            Array.from({ length: modelo.divisoes.verticais - 1 }).map((_, i) => (
              <div
                key={`v-div-${i}`}
                className="absolute bg-gray-300" // Slightly darker for visibility
                style={{
                  width: '1px',
                  height: '100%',
                  left: `${((i + 1) / modelo.divisoes!.verticais) * 100}%`,
                }}
              ></div>
            ))
          )}
        </div>
      ))}
    </div>
  );
};

export default ModeloRecipienteThumbnailSelector;

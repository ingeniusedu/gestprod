import React, { useState } from 'react';
import { LocalDeEstoque, Recipiente } from '../types/mapaEstoque';
import { Produto } from '../types'; // Import the correct Produto type

interface Dimensoes {
  x: number;
  y: number;
  z: number;
}

import { Edit, Gift, Box, Puzzle, Layers } from 'lucide-react';

interface StorageGrid2DProps {
  local: LocalDeEstoque;
  recipientes: Recipiente[];
  produtos: Produto[]; // Add produtos prop
  onRecipienteClick?: (recipiente: Recipiente) => void;
  onMoveRecipiente: (recipienteId: string, newPosition: { x: number; y: number; z: number }) => void;
  onEditStockClick: (recipiente: Recipiente) => void;
  currentZLevel: number;
}

const CELL_SIZE = 80; // Increased cell size for better visibility

const StorageGrid2D: React.FC<StorageGrid2DProps> = ({ local, recipientes, produtos, onRecipienteClick, onMoveRecipiente, onEditStockClick, currentZLevel }) => {
  const { dimensoesGrade } = local;
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; z: number } | null>(null);
  const [draggedItemDimensions, setDraggedItemDimensions] = useState<{ x: number; y: number; z: number } | null>(null);

  const renderProductIcon = (tipo: string) => {
    switch (tipo) {
      case 'kit':
        return <Gift size={12} className="text-yellow-400" />;
      case 'modelo':
        return <Box size={12} className="text-yellow-400" />;
      case 'peca':
        return <Puzzle size={12} className="text-yellow-400" />;
      case 'parte':
        return <Layers size={12} className="text-yellow-400" />;
      default:
        return null;
    }
  };

  const renderGridContent = (zLevel: number) => {
    const gridWidthPx = dimensoesGrade.x * CELL_SIZE;
    const gridHeightPx = dimensoesGrade.y * CELL_SIZE;

    return (
      <div className="flex justify-center">
        {/* Row Headers (Y-axis) */}
        <div className="flex flex-col-reverse mr-2"> {/* Reverse order for bottom-left 0 */}
          {Array.from({ length: dimensoesGrade.y }).map((_, y) => (
            <div key={`row-header-${y}`} className="flex items-center justify-center text-xs font-bold text-gray-700" style={{ height: `${CELL_SIZE}px`, width: `${CELL_SIZE}px` }}>
              {y}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center">
          {/* Column Headers (X-axis) */}
          <div className="flex mb-2"> {/* Align with grid */}
            {Array.from({ length: dimensoesGrade.x }).map((_, x) => (
              <div key={`col-header-${x}`} className="flex items-center justify-center text-xs font-bold text-gray-700" style={{ width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px` }}>
                {x}
              </div>
            ))}
          </div>

          {/* Main Grid and Recipient Cards */}
          <div
            className="relative border border-gray-300"
            style={{ width: gridWidthPx, height: gridHeightPx }}
            onDragOver={(e) => {
              e.preventDefault();
              const gridRect = e.currentTarget.getBoundingClientRect();
              const hoverX = e.clientX - gridRect.left;
              const hoverY = e.clientY - gridRect.top;

              const cellX = Math.floor(hoverX / CELL_SIZE);
              const cellY = dimensoesGrade.y - 1 - Math.floor(hoverY / CELL_SIZE); // Invert Y for bottom-left origin

              setHoveredCell({ x: cellX, y: cellY, z: zLevel });
            }}
            onDragLeave={() => setHoveredCell(null)}
            onDrop={(e) => {
              e.preventDefault();
              setHoveredCell(null); // Clear hover state on drop
              const recipienteId = e.dataTransfer.getData('recipienteId') || ''; // Ensure it's always a string
              const dimX = parseInt(e.dataTransfer.getData('recipienteDimX') || '1'); // Default to 1 if not found
              const dimY = parseInt(e.dataTransfer.getData('recipienteDimY') || '1'); // Default to 1 if not found

              const gridRect = e.currentTarget.getBoundingClientRect();
              const dropX = e.clientX - gridRect.left;
              const dropY = e.clientY - gridRect.top;

              // Calculate grid coordinates
              let newGridX = Math.floor(dropX / CELL_SIZE);
              let newGridY = dimensoesGrade.y - 1 - Math.floor(dropY / CELL_SIZE); // Invert Y for bottom-left origin

              console.log(`Dropped at grid: X=${newGridX}, Y=${newGridY}, Z=${currentZLevel}`);
              console.log(`Recipiente ID: ${recipienteId}, Dims: ${dimX}x${dimY}`);

              if (recipienteId) {
                onMoveRecipiente(recipienteId, { x: newGridX, y: newGridY, z: currentZLevel });
              }
            }}
          >
            {/* Render grid lines (background) */}
            {Array.from({ length: dimensoesGrade.y }).map((_, y) =>
              Array.from({ length: dimensoesGrade.x }).map((__, x) => (
                <div
                  key={`${x}-${y}`}
                  className="absolute border border-dashed border-gray-300"
                  style={{
                    left: x * CELL_SIZE,
                    // Invert Y for bottom-left origin
                    top: (dimensoesGrade.y - 1 - y) * CELL_SIZE,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                  }}
                ></div>
              ))
            )}

            {/* Render recipients as cards */}
            {recipientes
              .filter(rec => rec.posicaoNaGrade && rec.dimensoesOcupadas && 
                currentZLevel >= rec.posicaoNaGrade.z && 
                currentZLevel < (rec.posicaoNaGrade.z + rec.dimensoesOcupadas.z)
              )
              .map(recipiente => {
                const produtosNoRecipiente = produtos.filter(p => 
                  p.posicoesEstoque?.some(pos => pos.recipienteId === recipiente.id && pos.quantidade > 0)
                );
                const hasStock = produtosNoRecipiente.length > 0;
                const bgColor = hasStock ? 'bg-gray-800' : 'bg-black';
                const borderColor = 'border-gray-600';

                return (
                  <div
                    key={recipiente.id}
                    draggable="true"
                    onDragStart={(e) => {
                      if (recipiente.id) {
                        e.dataTransfer.setData('recipienteId', recipiente.id);
                      }
                      e.dataTransfer.setData('recipienteDimX', recipiente.dimensoesOcupadas.x.toString());
                      e.dataTransfer.setData('recipienteDimY', recipiente.dimensoesOcupadas.y.toString());
                      e.dataTransfer.setData('recipienteDimZ', recipiente.dimensoesOcupadas.z.toString()); // Pass Z dimension
                      setDraggedItemDimensions({ x: recipiente.dimensoesOcupadas.x, y: recipiente.dimensoesOcupadas.y, z: recipiente.dimensoesOcupadas.z });
                    }}
                    onDragEnd={() => setDraggedItemDimensions(null)}
                    className={`absolute shadow-lg rounded-lg hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-2 text-center border-2 group hover:scale-110 hover:z-20 ${bgColor} ${borderColor}`}
                    style={{
                      left: recipiente.posicaoNaGrade!.x * CELL_SIZE,
                      top: (dimensoesGrade.y - 1 - (recipiente.posicaoNaGrade!.y + recipiente.dimensoesOcupadas.y - 1)) * CELL_SIZE,
                      width: recipiente.dimensoesOcupadas.x * CELL_SIZE,
                      height: recipiente.dimensoesOcupadas.y * CELL_SIZE,
                      zIndex: 10,
                    }}
                    onClick={() => onRecipienteClick && onRecipienteClick(recipiente)}
                  >
                    <div className="w-full h-full flex flex-col items-center justify-center p-1 relative">
                      <div className="absolute top-0 left-0 w-full h-full grid" style={{ gridTemplateColumns: `repeat(${recipiente.divisoes?.verticais || 1}, 1fr)`, gridTemplateRows: `repeat(${recipiente.divisoes?.horizontais || 1}, 1fr)` }}>
                        {Array.from({ length: (recipiente.divisoes?.horizontais || 1) * (recipiente.divisoes?.verticais || 1) }).map((_, i) => {
                          const h = Math.floor(i / (recipiente.divisoes?.verticais || 1));
                          const v = i % (recipiente.divisoes?.verticais || 1);
                          
                          const produtosNaDivisao = produtos.filter(p => 
                            p.posicoesEstoque?.some(pos => 
                              pos.recipienteId === recipiente.id &&
                              (pos.divisao?.h ?? 0) === h &&
                              (pos.divisao?.v ?? 0) === v &&
                              pos.quantidade > 0
                            )
                          );

                          const temEstoqueNaDivisao = produtosNaDivisao.length > 0;

                          return (
                            <div key={i} className={`border border-gray-400 border-dashed flex flex-col items-center justify-center p-1 ${temEstoqueNaDivisao ? 'bg-gray-700' : 'bg-transparent'}`}>
                              {temEstoqueNaDivisao && (
                                <div className="text-center w-full text-white">
                                  <p className="text-xs font-bold truncate w-full">{produtosNaDivisao[0].sku}</p>
                                  <p className="text-xs truncate w-full">{produtosNaDivisao[0].nome}</p>
                                  <p className="text-xs">Qtd: {produtosNaDivisao.reduce((acc, p) => acc + (p.posicoesEstoque?.find(pos => pos.recipienteId === recipiente.id && (pos.divisao?.h ?? 0) === h && (pos.divisao?.v ?? 0) === v)?.quantidade || 0), 0)}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="absolute top-1 right-1 flex items-center space-x-1 z-20">
                        {hasStock && (
                          <div className="p-1 bg-gray-900 rounded-full">
                            {renderProductIcon(produtosNoRecipiente[0].tipoProduto)}
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditStockClick(recipiente);
                          }}
                          className="p-1 bg-gray-900 rounded-full text-white"
                          title="Editar Estoque"
                        >
                          <Edit size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            {/* Placeholder for dragged item */}
            {hoveredCell && draggedItemDimensions && 
              currentZLevel >= hoveredCell.z && 
              currentZLevel < (hoveredCell.z + draggedItemDimensions.z) && (
              <div
                className="absolute bg-blue-200 border-2 border-blue-500 opacity-70 pointer-events-none"
                style={{
                  left: hoveredCell.x * CELL_SIZE,
                  top: (dimensoesGrade.y - 1 - (hoveredCell.y + draggedItemDimensions.y - 1)) * CELL_SIZE,
                  width: draggedItemDimensions.x * CELL_SIZE,
                  height: draggedItemDimensions.y * CELL_SIZE,
                  zIndex: 50, // Ensure it's above other elements but below the modal
                }}
              ></div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white shadow rounded-lg p-6"> {/* Apply card styling here */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-gray-900">Andar Z: {currentZLevel}</h4>
      </div>
      {renderGridContent(currentZLevel)}
    </div>
  );
};

export default StorageGrid2D;

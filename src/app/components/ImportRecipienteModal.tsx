import React, { useState, useEffect } from 'react';
import { Recipiente, LocalDeEstoque } from '../types/mapaEstoque';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Select from 'react-select';

interface ImportRecipienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (recipiente: Recipiente) => void;
  selectedLocal: LocalDeEstoque | null;
  existingRecipientesInLocal: Recipiente[];
}

const ImportRecipienteModal: React.FC<ImportRecipienteModalProps> = ({ isOpen, onClose, onSave, selectedLocal, existingRecipientesInLocal }) => {
  const [unassignedRecipientes, setUnassignedRecipientes] = useState<Recipiente[]>([]);
  const [selectedRecipiente, setSelectedRecipiente] = useState<Recipiente | null>(null);
  const [suggestedPos, setSuggestedPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [manualPosX, setManualPosX] = useState(0);
  const [manualPosY, setManualPosY] = useState(0);
  const [manualPosZ, setManualPosZ] = useState(0);
  const [useSuggestedPos, setUseSuggestedPos] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUnassignedRecipientes = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'recipientes'));
        const allRecipientes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[];
        const unassigned = allRecipientes.filter(rec => 
          !rec.localEstoqueId && 
          selectedLocal && 
          rec.dimensoesOcupadas.z <= selectedLocal.dimensoesGrade.z // Filter by Z dimension
        );
        setUnassignedRecipientes(unassigned);
      } catch (err) {
        console.error("Error fetching unassigned receptacles:", err);
        setError("Erro ao carregar recipientes não atribuídos.");
      }
    };

    if (isOpen) {
      fetchUnassignedRecipientes();
      setSelectedRecipiente(null);
      setSuggestedPos(null);
      setUseSuggestedPos(true);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedLocal && selectedRecipiente) {
      const nextPos = findNextAvailablePosition(selectedLocal, existingRecipientesInLocal, selectedRecipiente.dimensoesOcupadas);
      setSuggestedPos(nextPos);
      setManualPosX(nextPos.x);
      setManualPosY(nextPos.y);
      setManualPosZ(nextPos.z);
    }
  }, [selectedLocal, selectedRecipiente, existingRecipientesInLocal]);

  const findNextAvailablePosition = (local: LocalDeEstoque, currentRecipientes: Recipiente[], newRecipienteDims: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    const occupiedCells = new Set<string>();
    currentRecipientes.forEach(rec => {
      if (rec.posicaoNaGrade && rec.dimensoesOcupadas) {
        for (let z = 0; z < rec.dimensoesOcupadas.z; z++) {
          for (let y = 0; y < rec.dimensoesOcupadas.y; y++) {
            for (let x = 0; x < rec.dimensoesOcupadas.x; x++) {
              occupiedCells.add(`${rec.posicaoNaGrade.x + x},${rec.posicaoNaGrade.y + y},${rec.posicaoNaGrade.z + z}`);
            }
          }
        }
      }
    });

    for (let z = 0; z < local.dimensoesGrade.z; z++) {
      for (let y = 0; y < local.dimensoesGrade.y; y++) {
        for (let x = 0; x < local.dimensoesGrade.x; x++) {
          let isAvailable = true;
          for (let dz = 0; dz < newRecipienteDims.z; dz++) {
            for (let dy = 0; dy < newRecipienteDims.y; dy++) {
              for (let dx = 0; dx < newRecipienteDims.x; dx++) {
                const targetX = x + dx;
                const targetY = y + dy;
                const targetZ = z + dz;

                if (targetX >= local.dimensoesGrade.x || targetY >= local.dimensoesGrade.y || targetZ >= local.dimensoesGrade.z || occupiedCells.has(`${targetX},${targetY},${targetZ}`)) {
                  isAvailable = false;
                  break;
                }
              }
              if (!isAvailable) break;
            }
            if (!isAvailable) break;
          }
          if (isAvailable) {
            return { x, y, z };
          }
        }
      }
    }
    return { x: -1, y: -1, z: -1 }; // No available position
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipiente || !selectedLocal) {
      setError("Selecione um recipiente e um local de estoque.");
      return;
    }

    let finalPosX = useSuggestedPos && suggestedPos ? suggestedPos.x : manualPosX;
    let finalPosY = useSuggestedPos && suggestedPos ? suggestedPos.y : manualPosY;
    let finalPosZ = useSuggestedPos && suggestedPos ? suggestedPos.z : manualPosZ;

    if (finalPosX === -1 || finalPosY === -1 || finalPosZ === -1) {
      setError("Não há posição disponível para este recipiente no local selecionado.");
      return;
    }

    const recipienteToValidate: Recipiente = {
      ...selectedRecipiente,
      localEstoqueId: selectedLocal.id!,
      posicaoNaGrade: { x: finalPosX, y: finalPosY, z: finalPosZ },
    };

    // Check if the new position is within the local's grid dimensions
    if (
      recipienteToValidate.posicaoNaGrade.x + recipienteToValidate.dimensoesOcupadas.x > selectedLocal.dimensoesGrade.x ||
      recipienteToValidate.posicaoNaGrade.y + recipienteToValidate.dimensoesOcupadas.y > selectedLocal.dimensoesGrade.y ||
      recipienteToValidate.posicaoNaGrade.z + recipienteToValidate.dimensoesOcupadas.z > selectedLocal.dimensoesGrade.z
    ) {
      setError("A posição selecionada excede as dimensões da grade do local.");
      return;
    }

    // Perform overlap check using the 3D logic
    const isOverlap = existingRecipientesInLocal.some(existingRec => {
      if (!existingRec.posicaoNaGrade || !existingRec.dimensoesOcupadas) return false;

      const newX1 = recipienteToValidate.posicaoNaGrade.x;
      const newY1 = recipienteToValidate.posicaoNaGrade.y;
      const newZ1 = recipienteToValidate.posicaoNaGrade.z;
      const newX2 = newX1 + recipienteToValidate.dimensoesOcupadas.x - 1;
      const newY2 = newY1 + recipienteToValidate.dimensoesOcupadas.y - 1;
      const newZ2 = newZ1 + recipienteToValidate.dimensoesOcupadas.z - 1;

      const existingX1 = existingRec.posicaoNaGrade.x;
      const existingY1 = existingRec.posicaoNaGrade.y;
      const existingZ1 = existingRec.posicaoNaGrade.z;
      const existingX2 = existingX1 + existingRec.dimensoesOcupadas.x - 1;
      const existingY2 = existingY1 + existingRec.dimensoesOcupadas.y - 1;
      const existingZ2 = existingZ1 + existingRec.dimensoesOcupadas.z - 1;

      return (
        newX1 <= existingX2 &&
        newX2 >= existingX1 &&
        newY1 <= existingY2 &&
        newY2 >= existingY1 &&
        newZ1 <= existingZ2 &&
        newZ2 >= existingZ1
      );
    });

    if (isOverlap) {
      setError("A posição selecionada se sobrepõe a um recipiente existente.");
      return;
    }

    const updatedRecipiente: Recipiente = {
      ...selectedRecipiente,
      localEstoqueId: selectedLocal.id!,
      posicaoNaGrade: { x: finalPosX, y: finalPosY, z: finalPosZ },
      updatedAt: new Date(),
    };
    onSave(updatedRecipiente);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
          Importar Recipiente para {selectedLocal?.nome}
        </h3>
        <form onSubmit={handleSubmit}>
          {error && <p className="text-red-500 mb-4">{error}</p>}

          <div className="mb-4">
            <label htmlFor="recipienteSelect" className="block text-sm font-medium text-gray-700">Selecionar Recipiente:</label>
            <Select
              id="recipienteSelect"
              options={unassignedRecipientes.map(rec => ({ value: rec.id, label: `${rec.nome} (${rec.dimensoesOcupadas.x}x${rec.dimensoesOcupadas.y}x${rec.dimensoesOcupadas.z})` }))}
              value={selectedRecipiente ? { value: selectedRecipiente.id, label: `${selectedRecipiente.nome} (${selectedRecipiente.dimensoesOcupadas.x}x${selectedRecipiente.dimensoesOcupadas.y}x${selectedRecipiente.dimensoesOcupadas.z})` } : null}
              onChange={(option) => setSelectedRecipiente(unassignedRecipientes.find(rec => rec.id === option?.value) || null)}
              placeholder="Selecione um recipiente não atribuído..."
              isClearable
              required
            />
          </div>

          {selectedRecipiente && suggestedPos && (
            <div className="mb-4 p-3 border rounded-md bg-blue-50">
              <label className="block text-sm font-medium text-gray-700 mb-2">Posição Sugerida:</label>
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="useSuggestedPos"
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  checked={useSuggestedPos}
                  onChange={(e) => setUseSuggestedPos(e.target.checked)}
                />
                <label htmlFor="useSuggestedPos" className="ml-2 text-sm text-gray-900">
                  Usar posição sugerida: ({suggestedPos.x}, {suggestedPos.y}, {suggestedPos.z})
                  {suggestedPos.x === -1 && <span className="text-red-600 ml-2"> (Nenhuma posição disponível)</span>}
                </label>
              </div>

              {!useSuggestedPos && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">Posição Manual (X, Y, Z):</label>
                  <div className="mt-1 grid grid-cols-3 gap-3">
                    <input
                      type="number"
                      placeholder="Pos X"
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={manualPosX}
                      onChange={(e) => setManualPosX(parseInt(e.target.value) || 0)}
                      min="0"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Pos Y"
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={manualPosY}
                      onChange={(e) => setManualPosY(parseInt(e.target.value) || 0)}
                      min="0"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Pos Z"
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={manualPosZ}
                      onChange={(e) => setManualPosZ(parseInt(e.target.value) || 0)}
                      min="0"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={!selectedRecipiente || (useSuggestedPos && suggestedPos?.x === -1)}
            >
              Importar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ImportRecipienteModal;

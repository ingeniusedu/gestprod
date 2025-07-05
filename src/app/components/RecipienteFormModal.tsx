import React, { useState, useEffect } from 'react';
import { Recipiente, LocalDeEstoque } from '../types/mapaEstoque';
import { ModeloRecipiente } from '../types/modeloRecipiente';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { X } from 'lucide-react';
import ModeloRecipienteThumbnailSelector from './ModeloRecipienteThumbnailSelector';

interface RecipienteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (recipiente: Recipiente) => void;
  initialData?: Recipiente | null;
  localEstoqueId: string;
  existingRecipients: Recipiente[]; // New prop for overlap check
  localDimensions: { x: number; y: number; z: number }; // Add localDimensions prop
}

const RecipienteFormModal: React.FC<RecipienteFormModalProps> = ({ isOpen, onClose, onSave, initialData, localEstoqueId, existingRecipients, localDimensions }) => {
  const [selectedModeloId, setSelectedModeloId] = useState<string | null>(null);
  const [modelos, setModelos] = useState<ModeloRecipiente[]>([]);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [posZ, setPosZ] = useState(0);
  const [error, setError] = useState(''); // New state for error messages
  
  // Overlap check function (updated to consider Z dimension)
  const checkOverlap = (newRec: Recipiente, existingRecs: Recipiente[]) => {
    const newX1 = newRec.posicaoNaGrade.x;
    const newY1 = newRec.posicaoNaGrade.y;
    const newZ1 = newRec.posicaoNaGrade.z;
    const newX2 = newX1 + newRec.dimensoesOcupadas.x - 1;
    const newY2 = newY1 + newRec.dimensoesOcupadas.y - 1;
    const newZ2 = newZ1 + newRec.dimensoesOcupadas.z - 1; // End Z level for new recipient

    for (const existingRec of existingRecs) {
      // Skip checking against itself when editing
      if (newRec.id && newRec.id === existingRec.id) {
        continue;
      }

      if (existingRec.localEstoqueId === newRec.localEstoqueId) {
        const existingX1 = existingRec.posicaoNaGrade.x;
        const existingY1 = existingRec.posicaoNaGrade.y;
        const existingZ1 = existingRec.posicaoNaGrade.z;
        const existingX2 = existingX1 + existingRec.dimensoesOcupadas.x - 1;
        const existingY2 = existingY1 + existingRec.dimensoesOcupadas.y - 1;
        const existingZ2 = existingZ1 + existingRec.dimensoesOcupadas.z - 1; // End Z level for existing recipient

        // Check for overlap in X, Y, and Z dimensions
        if (
          newX1 <= existingX2 &&
          newX2 >= existingX1 &&
          newY1 <= existingY2 &&
          newY2 >= existingY1 &&
          newZ1 <= existingZ2 && // New Z starts before or at existing Z ends
          newZ2 >= existingZ1    // New Z ends after or at existing Z starts
        ) {
          return true; // Overlap detected
        }
      }
    }
    return false; // No overlap
  };

  // Function to find the next available position
  const findNextAvailablePosition = (
    existingRecs: Recipiente[],
    gridX: number,
    gridY: number,
    gridZ: number,
    newRecWidth: number,
    newRecHeight: number,
    newRecDepth: number // Add newRecDepth
  ) => {
    for (let z = 0; z < gridZ; z++) {
      for (let y = 0; y < gridY; y++) {
        for (let x = 0; x < gridX; x++) {
          const potentialRec: Recipiente = {
            id: 'temp', // Temporary ID for check
            nome: '',
            modeloRecipienteId: '',
            tipo: 'outro',
            dimensoesOcupadas: { x: newRecWidth, y: newRecHeight, z: newRecDepth }, // Use newRecDepth
            divisoes: { horizontais: 0, verticais: 0 },
            localEstoqueId: localEstoqueId,
            posicaoNaGrade: { x, y, z },
          };
          if (!checkOverlap(potentialRec, existingRecs)) {
            return { x, y, z };
          }
        }
      }
    }
    return null; // No available position found
  };

  useEffect(() => {
    if (isOpen) {
      const fetchModelos = async () => {
        const querySnapshot = await getDocs(collection(db, 'modelosRecipiente'));
        const modelosList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ModeloRecipiente[];
        // Filter models where z dimension is greater than local's z dimension
        const filteredModelos = modelosList.filter(modelo => modelo.dimensoes.z <= localDimensions.z);
        setModelos(filteredModelos);
        setError(''); // Clear errors on open

        if (!initialData && filteredModelos.length > 0) {
          setSelectedModeloId(filteredModelos[0].id!);
        } else if (initialData) {
          setSelectedModeloId(initialData.modeloRecipienteId);
        } else {
          setSelectedModeloId(null);
        }
      };
      fetchModelos();
    }
  }, [isOpen, initialData, localDimensions.z]); // Add localDimensions.z to dependencies

  useEffect(() => {
    if (initialData) {
      setPosX(initialData.posicaoNaGrade?.x ?? 0);
      setPosY(initialData.posicaoNaGrade?.y ?? 0);
      setPosZ(initialData.posicaoNaGrade?.z ?? 0);
    } else {
      const selectedModelo = modelos.find(m => m.id === selectedModeloId);
      const newRecDepth = selectedModelo ? selectedModelo.dimensoes.z : 1; // Default to 1 if no model selected
      const nextPos = findNextAvailablePosition(existingRecipients, localDimensions.x, localDimensions.y, localDimensions.z, 1, 1, newRecDepth);
      if (nextPos) {
        setPosX(nextPos.x);
        setPosY(nextPos.y);
        setPosZ(nextPos.z);
      } else {
        setPosX(0);
        setPosY(0);
        setPosZ(0);
      }
    }
  }, [initialData, existingRecipients, localDimensions, selectedModeloId, modelos]); // Add selectedModeloId and modelos to dependencies

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Clear previous errors

    const selectedModelo = modelos.find(m => m.id === selectedModeloId);
    if (!selectedModelo || !localEstoqueId) {
      setError("Por favor, selecione um modelo de recipiente e um local de estoque.");
      return;
    }

    const recipienteToSave: Recipiente = {
      id: initialData?.id,
      nome: selectedModelo.nome,
      modeloRecipienteId: selectedModelo.id!,
      tipo: selectedModelo.tipo,
      dimensoesOcupadas: selectedModelo.dimensoes,
      divisoes: selectedModelo.divisoes,
      localEstoqueId: localEstoqueId,
      posicaoNaGrade: { x: posX, y: posY, z: posZ },
    };

    // Perform overlap check before saving
    if (checkOverlap(recipienteToSave, existingRecipients)) {
      setError("Não é possível salvar o recipiente, pois ele se sobrepõe a outro recipiente existente no mesmo local e andar.");
      return;
    }

    onSave(recipienteToSave);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">
            {initialData ? 'Editar Posição do Recipiente' : 'Adicionar Novo Recipiente ao Estoque'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-2 -mr-2">
          {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}
          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Selecione o Modelo</label>
              <ModeloRecipienteThumbnailSelector
                modelos={modelos}
                selectedModeloId={selectedModeloId}
                onSelect={setSelectedModeloId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Posição na Grade (X, Y, Z)</label>
              <div className="mt-1 grid grid-cols-3 gap-3">
                <input
                  type="number"
                  placeholder="Pos X"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={posX}
                  onChange={(e) => setPosX(parseInt(e.target.value) || 0)}
                  min="0"
                  required
                />
                <input
                  type="number"
                  placeholder="Pos Y"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={posY}
                  onChange={(e) => setPosY(parseInt(e.target.value) || 0)}
                  min="0"
                  required
                />
                <input
                  type="number"
                  placeholder="Pos Z"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={posZ}
                  onChange={(e) => setPosZ(parseInt(e.target.value) || 0)}
                  min="0"
                  required
                />
              </div>
            </div>
          </div>
        </form>

        <div className="flex justify-end pt-4 border-t border-gray-200 flex-shrink-0 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecipienteFormModal;

import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { LocalDeEstoque, Recipiente, LocalDeInsumo } from '../types/mapaEstoque';
import { PosicaoEstoque } from '../types';
import Select from 'react-select';
import RecipienteFormModal from './RecipienteFormModal';

interface InsumoStockPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (posicao: PosicaoEstoque) => void;
}

const InsumoStockPositionModal: React.FC<InsumoStockPositionModalProps> = ({ isOpen, onClose, onSave }) => {
  const [locaisDeInsumos, setLocaisDeInsumos] = useState<LocalDeInsumo[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  
  const [currentLocalId, setCurrentLocalId] = useState('');
  const [currentRecipienteId, setCurrentRecipienteId] = useState('');
  const [currentDivisao, setCurrentDivisao] = useState<{ h: number; v: number } | null>(null);
  const [currentQuantidade, setCurrentQuantidade] = useState(1);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRecipienteModalOpen, setIsRecipienteModalOpen] = useState(false);

  const selectedLocal = locaisDeInsumos.find(l => l.id === currentLocalId);
  const selectedRecipiente = recipientes.find(r => r.id === currentRecipienteId);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [locaisSnapshot, recipientesSnapshot] = await Promise.all([
          getDocs(collection(db, 'locaisInsumos')),
          getDocs(collection(db, 'recipientes')),
        ]);
        setLocaisDeInsumos(locaisSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalDeInsumo)));
        setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipiente)));
      } catch (err) {
        setError('Falha ao carregar dados.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isOpen]);

  const handleSaveRecipiente = async (recipienteData: Recipiente) => {
    // This is a simplified version. In a real app, you'd save to Firestore.
    const newRecipiente = { ...recipienteData, id: `temp-${Date.now()}` };
    setRecipientes(prev => [...prev, newRecipiente]);
    setCurrentRecipienteId(newRecipiente.id);
    setIsRecipienteModalOpen(false);
  };

  const handleSubmit = () => {
    let isValid = true;
    let errorMessage = '';

    if (!currentLocalId) {
      isValid = false;
      errorMessage = 'Por favor, selecione um local de estoque.';
    } else if (currentQuantidade <= 0) {
      isValid = false;
      errorMessage = 'A quantidade deve ser maior que zero.';
    } else if (selectedLocal?.tipo === 'gaveta' || selectedLocal?.tipo === 'outro') {
      // For types that require a recipient and division
      if (!currentRecipienteId || currentDivisao === null) {
        isValid = false;
        errorMessage = 'Por favor, preencha todos os campos e a quantidade deve ser maior que zero.';
      }
    } else if ((selectedLocal?.tipo === 'armario' || selectedLocal?.tipo === 'prateleira') && currentRecipienteId && currentDivisao === null) {
      // If a recipient is selected for armario/prateleira, division is required
      isValid = false;
      errorMessage = 'Por favor, selecione uma divisão para o recipiente.';
    } else if ((selectedLocal?.tipo === 'armario' || selectedLocal?.tipo === 'prateleira') && !currentRecipienteId && currentDivisao === null && (selectedLocal?.divisoes?.h || selectedLocal?.divisoes?.v)) {
      // If no recipient is selected for armario/prateleira, and local has divisions, division is required
      isValid = false;
      errorMessage = 'Por favor, selecione uma divisão para o local de estoque.';
    }


    if (!isValid) {
      setError(errorMessage);
      return;
    }

    const posicao: PosicaoEstoque = {
      localId: currentLocalId,
      localNome: selectedLocal?.nome || '',
      recipienteId: currentRecipienteId || undefined, // Only include if a recipient is selected
      divisao: currentDivisao || undefined, // Only include if a division is selected
      quantidade: currentQuantidade,
      posicaoNaGrade: selectedRecipiente ? selectedRecipiente.posicaoNaGrade : undefined // Only include if a recipient is selected
    };

    onSave(posicao);
    onClose();
  };

  if (!isOpen) return null;

  const isLocalTypeWithoutRecipient = selectedLocal?.tipo === 'armario' || selectedLocal?.tipo === 'prateleira';

  const hDivs = selectedRecipiente?.divisoes?.horizontais || (isLocalTypeWithoutRecipient && !currentRecipienteId ? (selectedLocal?.divisoes?.h || 1) : 1);
  const vDivs = selectedRecipiente?.divisoes?.verticais || (isLocalTypeWithoutRecipient && !currentRecipienteId ? (selectedLocal?.divisoes?.v || 1) : 1);

  const showRecipientFields = !isLocalTypeWithoutRecipient || (isLocalTypeWithoutRecipient && currentRecipienteId);
  const showDivisionGrid = selectedRecipiente || (isLocalTypeWithoutRecipient && !currentRecipienteId && (selectedLocal?.divisoes?.h || selectedLocal?.divisoes?.v));

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b">
          <h3 className="text-xl font-semibold">Adicionar Posição de Estoque</h3>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-red-500 bg-red-100 p-3 rounded">{error}</p>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Local</label>
              <Select
                options={locaisDeInsumos.filter(l => l.id).map(l => ({ value: l.id!, label: l.nome }))}
                onChange={opt => {
                  setCurrentLocalId(opt?.value || '');
                  setCurrentRecipienteId('');
                  setCurrentDivisao(null);
                }}
                isLoading={loading}
              />
            </div>
            {showRecipientFields && (
              <div className="flex items-end space-x-2">
                <div className="flex-grow">
                  <label className="block text-sm font-medium text-gray-700">Recipiente</label>
                  <Select
                    options={recipientes
                      .filter(r => r.id && r.localEstoqueId === currentLocalId)
                      .map(r => ({ value: r.id!, label: `${r.nome} (${r.posicaoNaGrade.x},${r.posicaoNaGrade.y},${r.posicaoNaGrade.z})` }))}
                    value={currentRecipienteId ? { value: currentRecipienteId, label: recipientes.find(r => r.id === currentRecipienteId)?.nome || '' } : null}
                    onChange={opt => setCurrentRecipienteId(opt?.value || '')}
                    isDisabled={!currentLocalId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecipienteModalOpen(true)}
                  disabled={!selectedLocal?.dimensoesGrade}
                  className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  <Plus size={20} />
                </button>
              </div>
            )}
          </div>

          {showDivisionGrid && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Divisão</label>
              <div className="mt-1 grid gap-1 bg-gray-100 p-2 rounded-md" style={{ gridTemplateColumns: `repeat(${vDivs}, 1fr)`, gridTemplateRows: `repeat(${hDivs}, 1fr)` }}>
                {Array.from({ length: hDivs * vDivs }).map((_, i) => {
                  const h = Math.floor(i / vDivs);
                  const v = i % vDivs;
                  const isSelected = currentDivisao?.h === h && currentDivisao?.v === v;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentDivisao({ h, v })}
                      className={`p-2 text-xs rounded-md ${isSelected ? 'bg-blue-600 text-white' : 'bg-white hover:bg-blue-50'}`}
                    >
                      {h},{v}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Quantidade</label>
            <input
              type="number"
              value={currentQuantidade}
              onChange={e => setCurrentQuantidade(parseInt(e.target.value) || 0)}
              min="1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end space-x-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md">Cancelar</button>
          <button type="button" onClick={handleSubmit} className="px-4 py-2 border rounded-md text-white bg-blue-600">Salvar Posição</button>
        </div>
        
        {isRecipienteModalOpen && selectedLocal?.dimensoesGrade && (
          <RecipienteFormModal
            isOpen={isRecipienteModalOpen}
            onClose={() => setIsRecipienteModalOpen(false)}
            onSave={handleSaveRecipiente}
            localEstoqueId={currentLocalId}
            existingRecipients={recipientes.filter(r => r.localEstoqueId === currentLocalId)}
            localDimensions={selectedLocal.dimensoesGrade}
          />
        )}
      </div>
    </div>
  );
};

export default InsumoStockPositionModal;

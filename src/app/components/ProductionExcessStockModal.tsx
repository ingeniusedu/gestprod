import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, doc, getDocs, getDoc, writeBatch, addDoc } from 'firebase/firestore';
import Select from 'react-select';
import { LocalProduto, Recipiente } from '../types/mapaEstoque';
import { PosicaoEstoque, Produto, Parte } from '../types';
import { X } from 'lucide-react';

interface ProductionExcessStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSuccess: () => void;
  onSendToAssembly: (partId: string, quantity: number) => void; // New prop for assembly logic
  partData: {
    id: string;
    nome: string;
    sku: string;
    quantidade: number;
  };
  pecaTipo: 'simples' | 'composta_um_grupo_sem_montagem' | 'composta_um_grupo_com_montagem' | 'composta_multiplos_grupos';
}

const ProductionExcessStockModal: React.FC<ProductionExcessStockModalProps> = ({ isOpen, onClose, onLaunchSuccess, onSendToAssembly, partData, pecaTipo }) => {
  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalProduto[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [allParts, setAllParts] = useState<Parte[]>([]);

  const [localId, setLocalId] = useState('');
  const [recipienteId, setRecipienteId] = useState('');
  const [divisao, setDivisao] = useState<{ h: number; v: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchRequiredData = async () => {
      setLoading(true);
      try {
        const [locaisSnapshot, recipientesSnapshot, partsSnapshot] = await Promise.all([
          getDocs(collection(db, 'locaisProdutos')),
          getDocs(collection(db, 'recipientes')),
          getDocs(collection(db, 'partes'))
        ]);

        setLocaisDeEstoque(locaisSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LocalProduto[]);
        setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);
        setAllParts(partsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Parte[]);

      } catch (err) {
        console.error("Erro ao buscar dados para o modal:", err);
        setError("Falha ao carregar dados necessários.");
      } finally {
        setLoading(false);
      }
    };

    fetchRequiredData();
  }, [isOpen]);

  const getDivisionOccupancyInfo = (recId: string, h: number, v: number) => {
    const partInDivision = allParts.find(p =>
      p.posicoesEstoque?.some(pos =>
        pos.recipienteId === recId &&
        (pos.divisao?.h ?? 0) === h &&
        (pos.divisao?.v ?? 0) === v &&
        pos.quantidade > 0
      )
    );
    if (!partInDivision) {
      return { occupied: false, byDifferent: false, productInfo: null };
    }
    const byDifferent = partInDivision.id !== partData.id;
    return { occupied: true, byDifferent, productInfo: `${partInDivision.sku} - ${partInDivision.nome}` };
  };

  const hasAvailableDivision = (rec: Recipiente) => {
    if (!rec.divisoes) return true; // Assume available if no division info
    const hDivs = rec.divisoes.horizontais || 1;
    const vDivs = rec.divisoes.verticais || 1;

    for (let h = 0; h < hDivs; h++) {
      for (let v = 0; v < vDivs; v++) {
        const occupancy = getDivisionOccupancyInfo(rec.id!, h, v);
        if (!occupancy.byDifferent) {
          return true; // Found at least one available division
        }
      }
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partData || !localId || !recipienteId || !divisao) {
      setError("Por favor, selecione o local, recipiente e divisão.");
      return;
    }

    setError('');
    setLoading(true);
    const batch = writeBatch(db);

    try {
      const partRef = doc(db, 'partes', partData.id);
      const partSnap = await getDoc(partRef);

      if (!partSnap.exists()) {
        throw new Error("A peça que você está tentando atualizar não foi encontrada.");
      }

      const currentPartData = partSnap.data() as Parte;
      const posicoesMap = new Map<string, PosicaoEstoque>();
      (currentPartData.posicoesEstoque || []).forEach(p => {
        const key = `${p.recipienteId}-${p.divisao?.h ?? 0}-${p.divisao?.v ?? 0}`;
        posicoesMap.set(key, { ...p });
      });

      const lancamentoKey = `${recipienteId}-${divisao.h}-${divisao.v}`;
      const existingPos = posicoesMap.get(lancamentoKey);

      if (existingPos) {
        existingPos.quantidade += partData.quantidade;
      } else {
        posicoesMap.set(lancamentoKey, { recipienteId, divisao, quantidade: partData.quantidade });
      }

      const newPosicoesEstoque = Array.from(posicoesMap.values()).filter(p => p.quantidade > 0);
      batch.update(partRef, { posicoesEstoque: newPosicoesEstoque });

      const lancamentoLogRef = doc(collection(db, 'lancamentosEstoque'));
      batch.set(lancamentoLogRef, {
        tipoProduto: 'parte',
        produtoId: partData.id,
        quantidade: partData.quantidade,
        tipoMovimento: 'entrada',
        data: new Date(),
        usuario: 'Sistema de Produção',
        observacao: `Excedente de produção lançado para estoque.`,
        localEstoqueId: localId,
        recipienteId,
        divisao,
      });

      await batch.commit();
      onLaunchSuccess();
    } catch (err: any) {
      console.error("Erro ao lançar estoque excedente:", err);
      setError(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  
  const resetForm = () => {
    setLocalId('');
    setRecipienteId('');
    setDivisao(null);
    setError('');
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const selectedRecipiente = recipientes.find(r => r.id === recipienteId);
  const hDivs = selectedRecipiente?.divisoes?.horizontais || 1;
  const vDivs = selectedRecipiente?.divisoes?.verticais || 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Lançar Excedente em Estoque</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-2 -mr-2 mt-4">
          {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}

          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
            <div>
              <label className="block text-sm font-medium text-gray-500">Produto</label>
              <p className="mt-1 text-md font-semibold text-gray-900">{partData.nome}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Quantidade a Lançar</label>
              <p className="mt-1 text-md font-semibold text-gray-900">{partData.quantidade}</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Local de Estoque</label>
              <Select
                options={locaisDeEstoque.map(l => ({ value: l.id!, label: l.nome }))}
                value={locaisDeEstoque.length > 0 && localId ? { value: localId, label: locaisDeEstoque.find(l => l.id === localId)?.nome || '' } : null}
                onChange={opt => {
                  setLocalId(opt?.value || '');
                  setRecipienteId('');
                  setDivisao(null);
                }}
                className="mt-1"
                placeholder="Selecione um local..."
                isLoading={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Recipiente</label>
              <Select
                options={recipientes
                  .filter(r => r.localEstoqueId === localId && hasAvailableDivision(r))
                  .map(r => ({ value: r.id!, label: r.nome }))}
                value={recipientes.length > 0 && recipienteId ? { value: recipienteId, label: recipientes.find(r => r.id === recipienteId)?.nome || '' } : null}
                onChange={opt => {
                  setRecipienteId(opt?.value || '');
                  setDivisao(null);
                }}
                isDisabled={!localId}
                className="mt-1"
                placeholder="Selecione um recipiente..."
                isLoading={loading}
              />
            </div>
            {selectedRecipiente && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Divisão</label>
                <div className="mt-1 grid gap-1 bg-gray-100 p-2 rounded-md" style={{ gridTemplateColumns: `repeat(${vDivs}, 1fr)`, gridTemplateRows: `repeat(${hDivs}, 1fr)` }}>
                  {Array.from({ length: hDivs * vDivs }).map((_, i) => {
                    const h = Math.floor(i / vDivs);
                    const v = i % vDivs;
                    const isSelected = divisao?.h === h && divisao?.v === v;
                    const occupancyInfo = getDivisionOccupancyInfo(selectedRecipiente.id!, h, v);
                    const buttonClass = `p-2 text-xs rounded-md ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-white hover:bg-blue-50 text-gray-700 shadow-sm'} ${occupancyInfo.byDifferent ? 'border-2 border-red-500 cursor-not-allowed' : ''}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => !occupancyInfo.byDifferent && setDivisao({ h, v })}
                        className={buttonClass}
                        disabled={occupancyInfo.byDifferent}
                        title={occupancyInfo.byDifferent ? `Ocupado por: ${occupancyInfo.productInfo}` : `Divisão ${h},${v}`}
                      >
                        {occupancyInfo.occupied && !occupancyInfo.byDifferent ? 'Mesma Peça' : occupancyInfo.productInfo || `${h},${v}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {pecaTipo === 'composta_um_grupo_com_montagem' || pecaTipo === 'composta_multiplos_grupos' ? (
            <div className="flex justify-end pt-4 border-t border-gray-200 flex-shrink-0 mt-6 space-x-3">
              <button type="button" className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
              <button type="button" onClick={() => onSendToAssembly(partData.id, partData.quantidade)} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400" disabled={loading}>
                Enviar para Montagem
              </button>
              <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400" disabled={loading || !divisao}>
                {loading ? 'Lançando...' : 'Lançar em Estoque'}
              </button>
            </div>
          ) : (
            <div className="flex justify-end pt-4 border-t border-gray-200 flex-shrink-0 mt-6">
              <button type="button" className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50" onClick={onClose} disabled={loading}>Cancelar</button>
              <button type="submit" className="ml-3 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400" disabled={loading || !divisao}>
                {loading ? 'Lançando...' : 'Confirmar Lançamento'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ProductionExcessStockModal;

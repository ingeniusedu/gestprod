import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, doc, getDocs, getDoc, writeBatch, FieldValue, addDoc } from 'firebase/firestore';
import Select from 'react-select';
import { LocalDeEstoque, Recipiente } from '../types/mapaEstoque';
import { PosicaoEstoque, Produto } from '../types';
import RecipienteFormModal from './RecipienteFormModal';
import { Plus, X } from 'lucide-react';

interface EstoqueLancamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLancamentoSuccess: () => void;
  initialTipoProduto?: string;
  recipiente?: Recipiente | null;
  local?: LocalDeEstoque | null;
}

// Simplified selected item state. We handle one item at a time for clarity.
interface SelectedItem {
  id: string;
  nome: string;
  sku: string;
  tipoProduto: string;
  posicoesEstoque: PosicaoEstoque[];
  currentEstoque: number;
}

const EstoqueLancamentoModal: React.FC<EstoqueLancamentoModalProps> = ({ isOpen, onClose, onLancamentoSuccess, initialTipoProduto, recipiente, local }) => {
  const [tipoProduto, setTipoProduto] = useState(initialTipoProduto || '');
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [tipoMovimento, setTipoMovimento] = useState('entrada');
  const [observacao, setObservacao] = useState('');
  const [produtosOptions, setProdutosOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // State for the new stock location form
  const [localId, setLocalId] = useState('');
  const [recipienteId, setRecipienteId] = useState('');
  const [divisao, setDivisao] = useState<{ h: number; v: number } | null>(null);
  const [quantidade, setQuantidade] = useState(1);

  const [locaisDeEstoque, setLocaisDeEstoque] = useState<LocalDeEstoque[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [isRecipienteModalOpen, setIsRecipienteModalOpen] = useState(false);
  const [occupiedRecipientsProductMap, setOccupiedRecipientsProductMap] = useState<Map<string, string | null>>(new Map());
  const [occupiedDivisionsProductMap, setOccupiedDivisionsProductMap] = useState<Map<string, string | null>>(new Map());
  const [allProducts, setAllProducts] = useState<Produto[]>([]); // New state to store all products

  // Fetch static data (locais and recipientes) and all products
  useEffect(() => {
    if (isOpen) {
      const fetchInitialData = async () => {
        try {
          setLoading(true);
          const [locaisSnapshot, recipientesSnapshot] = await Promise.all([
            getDocs(collection(db, 'locaisDeEstoque')),
            getDocs(collection(db, 'recipientes')),
          ]);
          setLocaisDeEstoque(locaisSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LocalDeEstoque[]);
          setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);

          // Fetch all product types for occupancy checks
          const productCollections = ['partes', 'pecas', 'modelos', 'kits', 'insumos'];
          const fetchedProducts: Produto[] = [];
          for (const collectionName of productCollections) {
            const querySnapshot = await getDocs(collection(db, collectionName));
            querySnapshot.docs.forEach(doc => fetchedProducts.push({ id: doc.id, ...doc.data() } as Produto));
          }
          setAllProducts(fetchedProducts);

        } catch (err) {
          console.error("Erro ao buscar dados iniciais:", err);
          setError("Erro ao carregar dados iniciais.");
        } finally {
          setLoading(false);
        }
      };
      fetchInitialData();
      if (initialTipoProduto) setTipoProduto(initialTipoProduto);
    } else {
      resetForm();
    }
  }, [isOpen, initialTipoProduto]);

  // Calculate occupied recipients and divisions maps whenever the modal is open, allProducts, or recipients change
  useEffect(() => {
    if (isOpen && recipientes.length > 0 && allProducts.length > 0) {
      const newOccupiedRecipientsMap = new Map<string, string | null>();
      const newOccupiedDivisionsMap = new Map<string, string | null>();

      recipientes.filter(rec => rec.id).forEach((rec: Recipiente) => {
        const recId: string = rec.id!;

        allProducts.forEach((p: Produto) => {
          p.posicoesEstoque?.forEach((pos: PosicaoEstoque) => {
            if (pos.recipienteId === recId && pos.quantidade > 0) {
              const divisionKey = `${recId}-${pos.divisao?.h ?? 0}-${pos.divisao?.v ?? 0}`;
              newOccupiedDivisionsMap.set(divisionKey, `${p.sku} - ${p.nome}`); // Store SKU - Nome
            }
          });
        });
        const occupyingProductForRecipient = allProducts.find((p: Produto) =>
          p.posicoesEstoque?.some((pos: PosicaoEstoque) => pos.recipienteId === recId && pos.quantidade > 0)
        );
        newOccupiedRecipientsMap.set(recId, occupyingProductForRecipient ? occupyingProductForRecipient.id : null);
      });
      setOccupiedRecipientsProductMap(newOccupiedRecipientsMap);
      setOccupiedDivisionsProductMap(newOccupiedDivisionsMap);
    }
  }, [isOpen, recipientes, allProducts]);

  // Pre-fill form if editing from stock map
  useEffect(() => {
    if (isOpen && recipiente && local && allProducts.length > 0) {
      setLocalId(local.id || '');
      setRecipienteId(recipiente.id || '');

      // Find the product and division to pre-fill from allProducts
      const productInRecipiente = allProducts.find((p: Produto) =>
        p.posicoesEstoque?.some((pos: PosicaoEstoque) => pos.recipienteId === recipiente.id && pos.quantidade > 0)
      );

      if (productInRecipiente) {
        const pos = productInRecipiente.posicoesEstoque?.find((pos: PosicaoEstoque) => pos.recipienteId === recipiente.id && pos.quantidade > 0);
        if (pos) {
          setDivisao(pos.divisao || { h: 0, v: 0 });
          
          // Set the selected item
          const currentEstoque = productInRecipiente.posicoesEstoque?.reduce((acc: number, p: PosicaoEstoque) => acc + p.quantidade, 0) || 0;
          setSelectedItem({
            id: productInRecipiente.id,
            nome: `${productInRecipiente.sku} - ${productInRecipiente.nome}`,
            sku: productInRecipiente.sku,
            tipoProduto: productInRecipiente.tipoProduto,
            posicoesEstoque: productInRecipiente.posicoesEstoque || [],
            currentEstoque: currentEstoque,
          });
        }
      }
      // Reset quantity for a new entry
      setQuantidade(1);
    }
  }, [isOpen, recipiente, local, allProducts]);

  const handleSaveRecipiente = async (recipienteData: Recipiente) => {
    try {
      // For new recipients, ensure the 'id' field is not passed to addDoc
      const { id, ...dataToSave } = recipienteData; // Destructure id to exclude it
      const docRef = await addDoc(collection(db, 'recipientes'), { ...dataToSave, createdAt: new Date() });
      const newRecipiente = { id: docRef.id, ...dataToSave } as Recipiente; // Use dataToSave for the new recipient object
      setRecipientes(prev => [...prev, newRecipiente]);
      setRecipienteId(docRef.id); // Auto-select the new recipient
      setIsRecipienteModalOpen(false);
    } catch (error) {
      console.error("Error saving new recipient: ", error);
      setError("Falha ao salvar novo recipiente.");
    }
  };

  // Fetch products when type changes
  useEffect(() => {
    if (tipoProduto && isOpen) {
      fetchProdutos(tipoProduto);
    } else {
      setProdutosOptions([]);
    }
  }, [tipoProduto, isOpen]);

  const fetchProdutos = async (type: string) => {
    setLoading(true);
    setError('');
    try {
      const collectionName = `${type}s`;
      const querySnapshot = await getDocs(collection(db, collectionName));
      const options = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const posicoes = data.posicoesEstoque || [];
        const currentEstoque = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + pos.quantidade, 0) + (data.estoque || 0);
        return {
          value: doc.id,
          label: `${data.sku || ''} - ${data.nome || ''}`.trim(),
          currentEstoque,
          posicoesEstoque: posicoes,
          tipoProduto: type,
          sku: data.sku || '',
        };
      });
      options.sort((a, b) => a.sku.localeCompare(b.sku));
      setProdutosOptions(options);
    } catch (err) {
      console.error("Erro ao buscar produtos:", err);
      setError("Erro ao carregar a lista de produtos.");
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (option: any) => {
    if (option) {
      setSelectedItem({
        id: option.value,
        nome: option.label,
        sku: option.sku,
        tipoProduto: option.tipoProduto,
        posicoesEstoque: option.posicoesEstoque || [],
        currentEstoque: option.currentEstoque,
      });
    } else {
      setSelectedItem(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !localId || !recipienteId || !divisao || quantidade <= 0) {
      setError("Por favor, preencha todos os campos do lançamento.");
      return;
    }

    setError('');
    setLoading(true);
    const batch = writeBatch(db);

    try {
      // Rule: Single Product Type per Recipient Division
      if (tipoMovimento === 'entrada') {
        // Fetch all product types to check for existing products in the target division
        const existingProductInDivision = allProducts.find(p =>
          p.posicoesEstoque?.some(pos =>
            pos.recipienteId === recipienteId &&
            (pos.divisao?.h ?? 0) === (divisao?.h ?? 0) &&
            (pos.divisao?.v ?? 0) === (divisao?.v ?? 0)
          )
        );

        if (existingProductInDivision && existingProductInDivision.id !== selectedItem.id) {
          throw new Error(`Esta divisão já está ocupada pelo produto '${existingProductInDivision.nome}'. Não é possível adicionar um produto diferente.`);
        }
      }

      const collectionName = `${selectedItem.tipoProduto}s`;
      const produtoRef = doc(db, collectionName, selectedItem.id);
      const produtoSnap = await getDoc(produtoRef);
      const productData = produtoSnap.data();

      // Initialize positions map from existing data, handling both old and new structures
      const posicoesMap = new Map<string, PosicaoEstoque>();
      const existingPosicoes: PosicaoEstoque[] = productData?.posicoesEstoque || [];
      existingPosicoes.forEach(p => {
        const key = `${p.recipienteId}-${p.divisao?.h ?? 0}-${p.divisao?.v ?? 0}`;
        posicoesMap.set(key, { ...p });
      });

      // Handle migration from old structure if needed
      if (!productData?.posicoesEstoque && productData?.recipienteId && productData?.estoque > 0) {
        const key = `${productData.recipienteId}-0-0`;
        posicoesMap.set(key, {
          recipienteId: productData.recipienteId,
          quantidade: productData.estoque,
          divisao: { h: 0, v: 0 }
        });
      }

      // Apply the new stock movement
      const lancamentoKey = `${recipienteId}-${divisao.h}-${divisao.v}`;
      const existingPos = posicoesMap.get(lancamentoKey);

      if (tipoMovimento === 'entrada') {
        if (existingPos) {
          existingPos.quantidade += quantidade;
        } else {
          posicoesMap.set(lancamentoKey, { recipienteId, divisao, quantidade });
        }
      } else if (tipoMovimento === 'saida') {
        if (existingPos && existingPos.quantidade >= quantidade) {
          existingPos.quantidade -= quantidade;
        } else {
          throw new Error(`Estoque insuficiente para ${selectedItem.nome} na divisão selecionada.`);
        }
      } else if (tipoMovimento === 'ajuste') {
        if (existingPos) {
          existingPos.quantidade = quantidade;
        } else {
          posicoesMap.set(lancamentoKey, { recipienteId, divisao, quantidade });
        }
      }

      // Log the transaction
      const lancamentoLogRef = doc(collection(db, 'estoqueLancamentos'));
      batch.set(lancamentoLogRef, {
        tipoProduto: selectedItem.tipoProduto,
        produtoId: selectedItem.id,
        quantidade,
        tipoMovimento,
        data: new Date(),
        usuario: 'Usuário Atual', // Placeholder
        observacao,
        localEstoqueId: localId,
        recipienteId,
        divisao,
      });

      // Update the product document with the new stock positions and remove old fields
      const newPosicoesEstoque = Array.from(posicoesMap.values()).filter(p => p.quantidade > 0);
      batch.update(produtoRef, {
        posicoesEstoque: newPosicoesEstoque,
        estoque: null,
        local: null,
        recipienteId: null,
      });

      await batch.commit();
      onLancamentoSuccess();
      onClose();
    } catch (err: any) {
      console.error("Erro ao lançar estoque:", err);
      setError(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTipoProduto(initialTipoProduto || '');
    setSelectedItem(null);
    setTipoMovimento('entrada');
    setObservacao('');
    setProdutosOptions([]);
    setError('');
    setLocalId('');
    setRecipienteId('');
    setDivisao(null);
    setQuantidade(1);
  };

  const getDivisionOccupancyInfo = (recId: string, h: number, v: number, currentProdId: string | undefined) => {
    const divisionKey = `${recId}-${h}-${v}`;
    const occupyingProductInfo = occupiedDivisionsProductMap.get(divisionKey); // This now stores "SKU - Nome" or null

    if (!occupyingProductInfo) {
      return { occupied: false, byDifferent: false, productInfo: null }; // Not occupied
    }

    // Find the product ID from the productInfo (e.g., "SKU - Nome" -> find product with that SKU/Name to get ID)
    // This is a bit inefficient, but necessary if we only store "SKU - Nome" in the map.
    // A better approach would be to store { productId: string, productSkuName: string } in the map.
    // Find the product ID from the productInfo (e.g., "SKU - Nome" -> find product with that SKU/Name to get ID)
    const occupyingProduct = allProducts.find(p => `${p.sku} - ${p.nome}` === occupyingProductInfo);
    const occupyingProductId = occupyingProduct?.id;

    const byDifferent = occupyingProductId !== null && occupyingProductId !== undefined && occupyingProductId !== currentProdId;
    return { occupied: true, byDifferent, productInfo: occupyingProductInfo };
  };

  const hasAvailableDivision = (recId: string, currentProdId: string | undefined) => {
    const selectedRec = recipientes.find(r => r.id === recId);
    if (!selectedRec) return false;

    const hDivs = selectedRec.divisoes?.horizontais || 1;
    const vDivs = selectedRec.divisoes?.verticais || 1;

    for (let h = 0; h < hDivs; h++) {
      for (let v = 0; v < vDivs; v++) {
        const occupancy = getDivisionOccupancyInfo(recId, h, v, currentProdId);
        if (!occupancy.byDifferent) { // If it's not occupied by a different product (i.e., empty or same product)
          return true;
        }
      }
    }
    return false;
  };

  const selectedRecipiente = recipientes.find(r => r.id === recipienteId);
  const hDivs = selectedRecipiente?.divisoes?.horizontais || 1;
  const vDivs = selectedRecipiente?.divisoes?.verticais || 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-4">Lançamento de Estoque</h2>
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-xl font-semibold text-gray-900">Lançamento de Estoque</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto pr-2 -mr-2">
            {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de Produto</label>
                <select id="tipoProduto" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={tipoProduto} onChange={(e) => { setTipoProduto(e.target.value); setSelectedItem(null); }} required>
                  <option value="">Selecione o Tipo de Produto</option>
                  <option value="parte">Parte</option>
                  <option value="peca">Peça</option>
                  <option value="modelo">Modelo</option>
                  <option value="kit">Kit</option>
                  <option value="insumo">Insumo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de Movimento</label>
                <select id="tipoMovimento" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={tipoMovimento} onChange={(e) => setTipoMovimento(e.target.value)} required>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Produto</label>
              <Select
                options={produtosOptions}
                value={selectedItem ? { value: selectedItem.id, label: selectedItem.nome } : null}
                onChange={handleProductSelect}
                isLoading={loading}
                isDisabled={!tipoProduto || loading}
                placeholder="Selecione um produto..."
                isClearable
                className="mt-1"
              />
            </div>

            {selectedItem && (
              <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-gray-900">{selectedItem.nome}</h3>
                <p className="text-sm text-gray-600 mb-4">Estoque Total Atual: {selectedItem.currentEstoque}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Local</label>
                    <Select
                      options={locaisDeEstoque.filter(l => l.id).map(l => ({ value: l.id!, label: l.nome }))}
                      value={locaisDeEstoque.length > 0 && localId ? { value: localId, label: locaisDeEstoque.find(l => l.id === localId)?.nome || '' } : null}
                      onChange={opt => setLocalId(opt?.value || '')}
                      isDisabled={!!recipiente} // Disable if editing
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-end space-x-2">
                    <div className="flex-grow">
                      <label className="block text-sm font-medium text-gray-700">Recipiente</label>
                      <Select
                        options={recipientes
                          .filter(r => r.localEstoqueId === localId && r.id && hasAvailableDivision(r.id, selectedItem?.id)) // Filter recipients with no free divisions
                          .map(r => ({ value: r.id!, label: r.nome }))}
                        value={recipientes.length > 0 && recipienteId ? { value: recipienteId, label: recipientes.find(r => r.id === recipienteId)?.nome || '' } : null}
                        onChange={opt => setRecipienteId(opt?.value || '')}
                        isDisabled={!!recipiente || !localId}
                        className="mt-1"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRecipienteModalOpen(true)}
                      disabled={!localId}
                      className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 flex-shrink-0"
                      title="Adicionar Novo Recipiente"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                  <input type="number" value={quantidade} onChange={e => setQuantidade(parseInt(e.target.value) || 0)} min="1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
                </div>
                {selectedRecipiente && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Divisão</label>
                    <div className="mt-1 grid gap-1 bg-gray-100 p-2 rounded-md" style={{ gridTemplateColumns: `repeat(${vDivs}, 1fr)`, gridTemplateRows: `repeat(${hDivs}, 1fr)` }}>
                      {Array.from({ length: hDivs * vDivs }).map((_, i) => {
                        const h = Math.floor(i / vDivs);
                        const v = i % vDivs;
                        const isSelected = divisao?.h === h && divisao?.v === v;
                        const occupancyInfo = selectedRecipiente?.id ? getDivisionOccupancyInfo(selectedRecipiente.id, h, v, selectedItem?.id) : { occupied: false, byDifferent: false, productInfo: null };

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
                            {occupancyInfo.occupied ? occupancyInfo.productInfo : `${h},${v}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="observacao" className="block text-sm font-medium text-gray-700">Observação (opcional):</label>
              <textarea id="observacao" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}></textarea>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200 flex-shrink-0 mt-4">
            <button type="button" className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400" disabled={loading || !selectedItem}>{loading ? 'Lançando...' : 'Confirmar Lançamento'}</button>
          </div>
        </form>

        {isRecipienteModalOpen && (
          <RecipienteFormModal
            isOpen={isRecipienteModalOpen}
            onClose={() => setIsRecipienteModalOpen(false)}
            onSave={handleSaveRecipiente}
            localEstoqueId={localId}
            existingRecipients={recipientes.filter(r => r.localEstoqueId === localId)}
          />
        )}
      </div>
    </div>
  );
};

export default EstoqueLancamentoModal;

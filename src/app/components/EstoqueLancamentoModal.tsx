import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, doc, getDocs, getDoc, writeBatch, FieldValue, addDoc } from 'firebase/firestore';
import Select from 'react-select';
import { LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { PosicaoEstoque, Produto, LancamentoProduto, LancamentoInsumo } from '../types';
import RecipienteFormModal from './RecipienteFormModal';
import { Plus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cleanObject } from '../utils/cleanObject';

interface EstoqueLancamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLancamentoSuccess: () => void;
  initialTipoProduto?: string;
  recipiente?: Recipiente | null;
  local?: LocalProduto | LocalInsumo | null;
  initialData?: LancamentoProduto | LancamentoInsumo | null;
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

const EstoqueLancamentoModal: React.FC<EstoqueLancamentoModalProps> = ({ isOpen, onClose, onLancamentoSuccess, initialTipoProduto, recipiente, local, initialData }) => {
  const modalContentRef = useRef<HTMLDivElement>(null);

  const setModalContentRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      modalContentRef.current = node;
    }
  }, []);
  const singularizeType = (type: string) => {
    if (type.endsWith('s')) {
      return type.slice(0, -1);
    }
    return type;
  };

  const [tipoProduto, setTipoProduto] = useState(singularizeType(initialTipoProduto || (initialData && 'tipoProduto' in initialData ? initialData.tipoProduto : (initialData && 'tipoInsumo' in initialData ? initialData.tipoInsumo : ''))));
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  const getValidTipoMovimento = (data: LancamentoProduto | LancamentoInsumo | null | undefined): 'entrada' | 'saida' | 'ajuste' => {
    if (data && (data.tipoMovimento === 'entrada' || data.tipoMovimento === 'saida' || data.tipoMovimento === 'ajuste')) {
      return data.tipoMovimento;
    }
    return 'entrada';
  };

  const [tipoMovimento, setTipoMovimento] = useState<'entrada' | 'saida' | 'ajuste'>(getValidTipoMovimento(initialData));
  const [observacao, setObservacao] = useState(initialData && 'observacao' in initialData ? initialData.observacao : (initialData && 'detalhes' in initialData ? initialData.detalhes : ''));
  const [produtosOptions, setProdutosOptions] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // State for the new stock location form
  const [lancamentoLocais, setLancamentoLocais] = useState<{ id: string; localId: string; recipienteId?: string; divisao: { h: number; v: number } | null; quantidade: number; selectedLocalDimensions: { x: number; y: number; z: number } | null; }[]>([]);
  const [currentLocalId, setCurrentLocalId] = useState(''); // For the "Add new location" flow
  const [currentRecipienteId, setCurrentRecipienteId] = useState(''); // For the "Add new location" flow
  const [currentDivisao, setCurrentDivisao] = useState<{ h: number; v: number } | null>(null); // For the "Add new location" flow
  const [currentQuantidade, setCurrentQuantidade] = useState(1); // For the "Add new location" flow
  const [currentSelectedLocalDimensions, setCurrentSelectedLocalDimensions] = useState<{ x: number; y: number; z: number } | null>(null); // For the "Add new location" flow

  const [locaisDeEstoque, setLocaisDeEstoque] = useState<(LocalProduto | LocalInsumo)[]>([]);
  const [recipientes, setRecipientes] = useState<Recipiente[]>([]);
  const [isRecipienteModalOpen, setIsRecipienteModalOpen] = useState(false);
  const [occupiedRecipientsProductMap, setOccupiedRecipientsProductMap] = useState<Map<string, string | null>>(new Map());
  const [occupiedDivisionsProductMap, setOccupiedDivisionsProductMap] = useState<Map<string, string | null>>(new Map());
  const [allProducts, setAllProducts] = useState<Produto[]>([]); // New state to store all products

  const fetchAllProducts = async (): Promise<Produto[]> => {
    const productCollections = ['partes', 'pecas', 'modelos', 'kits', 'insumos'];
    let allFetchedProducts: Produto[] = [];
    for (const collectionName of productCollections) {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const productsOfType = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), tipoProduto: singularizeType(collectionName) })) as Produto[];
        allFetchedProducts = allFetchedProducts.concat(productsOfType);
      } catch (err) {
        console.error(`Erro ao buscar produtos da coleção ${collectionName}:`, err);
      }
    }
    return allFetchedProducts;
  };

  // Main useEffect for modal initialization and data fetching
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    const fetchInitialData = async () => {
      setLoading(true);
      setError('');
      try {
        const [locaisProdutosSnapshot, locaisInsumosSnapshot, recipientesSnapshot, allProductsData] = await Promise.all([
          getDocs(collection(db, 'locaisProdutos')),
          getDocs(collection(db, 'locaisInsumos')),
          getDocs(collection(db, 'recipientes')),
          fetchAllProducts(),
        ]);

        const fetchedLocaisProdutos = locaisProdutosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), collectionType: 'locaisProdutos' })) as LocalProduto[];
        const fetchedLocaisInsumos = locaisInsumosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), collectionType: 'locaisInsumos' })) as LocalInsumo[];
        setLocaisDeEstoque([...fetchedLocaisProdutos, ...fetchedLocaisInsumos]);
        setRecipientes(recipientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipiente[]);
        setAllProducts(allProductsData);

        const initialType = singularizeType(initialTipoProduto || (initialData && 'tipoProduto' in initialData ? initialData.tipoProduto : (initialData && 'tipoInsumo' in initialData ? initialData.tipoInsumo : '')));
        setTipoProduto(initialType);
        setTipoMovimento(getValidTipoMovimento(initialData));
        setObservacao(initialData && 'observacao' in initialData ? initialData.observacao : (initialData && 'detalhes' in initialData ? initialData.detalhes : ''));

        let productOptions: any[] = [];
        if (initialType) {
          productOptions = await fetchProdutos(initialType);
        }

        if (initialData) {
          const initialProductId = 'produtoId' in initialData ? initialData.produtoId : ('insumoId' in initialData ? initialData.insumoId : null);
          if (initialProductId && productOptions.length > 0) {
            const selectedOption = productOptions.find(opt => opt.value === initialProductId);
            if (selectedOption) {
              handleProductSelect(selectedOption);
            }
          }
          if (initialData.locais && initialData.locais.length > 0) {
            const initialLancamentoLocais = initialData.locais.map(loc => {
              const associatedLocal = locaisDeEstoque.find(l => l.id === loc.localId);
              return {
                id: uuidv4(),
                localId: loc.localId!,
                recipienteId: loc.recipienteId,
                divisao: loc.divisao || null,
                quantidade: loc.quantidade,
                selectedLocalDimensions: associatedLocal?.dimensoesGrade || null,
              };
            });
            setLancamentoLocais(initialLancamentoLocais);
          }
        } else if (recipiente && local) {
          setCurrentLocalId(local.id || '');
          setCurrentRecipienteId(recipiente.id || '');
          if (local.dimensoesGrade) {
            setCurrentSelectedLocalDimensions(local.dimensoesGrade);
          }
          const productInRecipiente = allProductsData.find((p: Produto) =>
            p.posicoesEstoque?.some((pos: PosicaoEstoque) => pos.recipienteId === recipiente.id && pos.quantidade > 0)
          );

          if (productInRecipiente) {
            const pos = productInRecipiente.posicoesEstoque?.find((pos: PosicaoEstoque) => pos.recipienteId === recipiente.id && pos.quantidade > 0);
            if (pos) {
              setCurrentDivisao(pos.divisao || { h: 0, v: 0 });
              const currentEstoque = productInRecipiente.posicoesEstoque?.reduce((acc: number, p: PosicaoEstoque) => acc + p.quantidade, 0) || 0;
              setSelectedItem({
                id: productInRecipiente.id,
                nome: `${productInRecipiente.sku || ''} - ${productInRecipiente.nome}`,
                sku: productInRecipiente.sku || '',
                tipoProduto: productInRecipiente.tipoProduto,
                posicoesEstoque: productInRecipiente.posicoesEstoque || [],
                currentEstoque: currentEstoque,
              });
            }
          }
          setCurrentQuantidade(1);
        }

      } catch (err) {
        console.error("Erro ao inicializar o modal:", err);
        setError("Falha ao carregar dados iniciais.");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [isOpen, initialData, initialTipoProduto, recipiente, local]); // Removed allProducts from dependency array

  // Fetch products whenever tipoProduto changes
  useEffect(() => {
    if (tipoProduto) {
      fetchProdutos(tipoProduto);
    } else {
      setProdutosOptions([]); // Clear options if no type is selected
      setSelectedItem(null);
    }
  }, [tipoProduto]);

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

  const handleSaveRecipiente = async (recipienteData: Recipiente) => {
    try {
      // For new recipients, ensure the 'id' field is not passed to addDoc
      const { id, ...dataToSave } = recipienteData; // Destructure id to exclude it
      const docRef = await addDoc(collection(db, 'recipientes'), { ...dataToSave, createdAt: new Date() });
      const newRecipiente = { id: docRef.id, ...dataToSave } as Recipiente; // Use dataToSave for the new recipient object
      setRecipientes(prev => [...prev, newRecipiente]);
      setCurrentRecipienteId(docRef.id); // Auto-select the new recipient
      setIsRecipienteModalOpen(false);
    } catch (error) {
      console.error("Error saving new recipient: ", error);
      setError("Falha ao salvar novo recipiente.");
    }
  };

  const fetchProdutos = async (type: string): Promise<any[]> => {
    setLoading(true);
    setError('');
    try {
      let collectionName: string;
      let options: any[] = [];

      if (['parte', 'peca', 'modelo', 'kit'].includes(type)) {
        collectionName = `${type}s`;
        const querySnapshot = await getDocs(collection(db, collectionName));
        options = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const posicoes = data.posicoesEstoque || [];
          const currentEstoque = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
          return {
            value: doc.id,
            label: `${data.sku || ''} - ${data.nome || ''}`.trim(),
            currentEstoque,
            posicoesEstoque: posicoes,
            tipoProduto: type,
            sku: data.sku || '',
          };
        });
      } else if (type === 'insumo') {
        collectionName = 'insumos';
        const querySnapshot = await getDocs(collection(db, collectionName));
        options = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const posicoes = data.posicoesEstoque || [];
          const currentEstoque = posicoes.reduce((acc: number, pos: PosicaoEstoque) => acc + (pos.quantidade || 0), 0);
          return {
            value: doc.id,
            label: `${data.nome || ''} (${data.tipo || ''})`.trim(),
            currentEstoque,
            posicoesEstoque: posicoes,
            tipoProduto: type,
            sku: data.nome || '', // Using nome as sku for sorting/display consistency
          };
        });
      } else {
        setError("Tipo de produto inválido.");
        return [];
      }

      options.sort((a, b) => a.sku.localeCompare(b.sku));
      setProdutosOptions(options);
      return options;
    } catch (err) {
      console.error("Erro ao buscar produtos:", err);
      setError("Erro ao carregar a lista de produtos.");
      return [];
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

    if (!selectedItem) {
      setError("Por favor, selecione um produto.");
      return;
    }

    if (lancamentoLocais.length === 0) {
      setError("Por favor, adicione pelo menos um local de lançamento.");
      return;
    }

    // Validate each entry in lancamentoLocais
    for (const entry of lancamentoLocais) {
      const local = locaisDeEstoque.find(l => l.id === entry.localId);
      const isRecipienteRequired = local?.tipo !== 'armario' && local?.tipo !== 'prateleira';
      if (!entry.localId || (isRecipienteRequired && !entry.recipienteId) || entry.divisao === null || entry.quantidade <= 0) {
        setError("Por favor, preencha todos os campos para cada local de lançamento e garanta que a quantidade seja maior que zero.");
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      const batch = writeBatch(db);

      for (const entry of lancamentoLocais) {
        // Client-side check for 'entrada' to prevent adding different products to occupied divisions
        if (tipoMovimento === 'entrada') {
          const existingProductInDivision = allProducts.find(p =>
            p.posicoesEstoque?.some(pos =>
              pos.recipienteId === entry.recipienteId &&
              (pos.divisao?.h ?? 0) === (entry.divisao?.h ?? 0) &&
              (pos.divisao?.v ?? 0) === (entry.divisao?.v ?? 0) &&
              pos.quantidade > 0 // Check if there's actual stock
            )
          );

          if (existingProductInDivision && existingProductInDivision.id !== selectedItem.id) {
            throw new Error(`A divisão no recipiente ${recipientes.find(r => r.id === entry.recipienteId)?.nome} já está ocupada pelo produto '${existingProductInDivision.nome}'. Não é possível adicionar um produto diferente.`);
          }
        }

        if (['parte', 'peca', 'modelo', 'kit'].includes(selectedItem.tipoProduto)) {
          const lancamentoProduto: LancamentoProduto = {
            id: uuidv4(),
            tipoProduto: selectedItem.tipoProduto as LancamentoProduto['tipoProduto'],
            produtoId: selectedItem.id,
            tipoMovimento,
            usuario: 'Usuário Atual',
            observacao,
            data: new Date() as any, // Firestore Timestamp
            locais: [
              {
                recipienteId: entry.recipienteId,
                divisao: entry.divisao || undefined,
                quantidade: entry.quantidade,
                localId: entry.localId,
              }
            ]
          };
          batch.set(doc(collection(db, 'lancamentosProdutos'), lancamentoProduto.id), cleanObject(lancamentoProduto));
        } else if (selectedItem.tipoProduto === 'insumo') {
          const lancamentoInsumo: LancamentoInsumo = {
            id: uuidv4(),
            insumoId: selectedItem.id,
            tipoInsumo: selectedItem.tipoProduto as LancamentoInsumo['tipoInsumo'],
            tipoMovimento,
            quantidade: entry.quantidade, // For insumos, quantity is directly in the lancamento
            unidadeMedida: 'un', // Placeholder - adjust as needed
            data: new Date() as any, // Firestore Timestamp
            origem: 'Modal de Lançamento', // Placeholder
            detalhes: observacao, // Use 'detalhes' for LancamentoInsumo
            locais: [
              {
                recipienteId: entry.recipienteId,
                divisao: entry.divisao || undefined,
                quantidade: entry.quantidade,
                localId: entry.localId,
              }
            ]
          };
          batch.set(doc(collection(db, 'lancamentosInsumos'), lancamentoInsumo.id), cleanObject(lancamentoInsumo));
        }
      }

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
    setTipoProduto(singularizeType(initialTipoProduto || (initialData && 'tipoProduto' in initialData ? initialData.tipoProduto : (initialData && 'tipoInsumo' in initialData ? initialData.tipoInsumo : ''))));
    setSelectedItem(null);
    setTipoMovimento(getValidTipoMovimento(initialData));
    setObservacao(initialData && 'observacao' in initialData ? initialData.observacao : (initialData && 'detalhes' in initialData ? initialData.detalhes : ''));
    setProdutosOptions([]);
    setError('');
    setLancamentoLocais([]);
    setCurrentLocalId('');
    setCurrentRecipienteId('');
    setCurrentDivisao(null);
    setCurrentQuantidade(1);
    setCurrentSelectedLocalDimensions(null);
  };

  const getDivisionOccupancyInfo = (recId: string, h: number, v: number, currentProdId: string | undefined) => {
    const divisionKey = `${recId}-${h}-${v}`;
    const occupyingProductInfo = occupiedDivisionsProductMap.get(divisionKey); // This now stores "SKU - Nome" or null

    if (!occupyingProductInfo) {
      return { occupied: false, byDifferent: false, productInfo: null, productId: null }; // Not occupied
    }

    const occupyingProduct = allProducts.find(p => `${p.sku} - ${p.nome}` === occupyingProductInfo);
    const occupyingProductId = occupyingProduct?.id;

    const byDifferent = occupyingProductId !== null && occupyingProductId !== undefined && occupyingProductId !== currentProdId;
    return { occupied: true, byDifferent, productInfo: occupyingProductInfo, productId: occupyingProductId };
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

  const recipientHasSelectedProduct = (recId: string, prodId: string | undefined) => {
    if (!prodId) return false;
    const recipientProduct = occupiedRecipientsProductMap.get(recId);
    return recipientProduct === prodId;
  };

  const addLancamentoLocal = () => {
    const local = locaisDeEstoque.find(l => l.id === currentLocalId);
    const isRecipienteRequired = local?.tipo !== 'armario' && local?.tipo !== 'prateleira';

    if (!currentLocalId || (isRecipienteRequired && !currentRecipienteId) || currentDivisao === null || currentQuantidade <= 0) {
      setError("Por favor, preencha todos os campos do local de lançamento atual antes de adicionar.");
      return;
    }

    const newEntry = {
      id: uuidv4(),
      localId: currentLocalId,
      recipienteId: currentRecipienteId,
      divisao: currentDivisao,
      quantidade: currentQuantidade,
      selectedLocalDimensions: currentSelectedLocalDimensions,
    };

    setLancamentoLocais(prev => [...prev, newEntry]);
    // Reset current fields for next entry
    setCurrentLocalId('');
    setCurrentRecipienteId('');
    setCurrentDivisao(null);
    setCurrentQuantidade(1);
    setCurrentSelectedLocalDimensions(null);
    setError('');
  };

  const removeLancamentoLocal = (idToRemove: string) => {
    setLancamentoLocais(prev => prev.filter(loc => loc.id !== idToRemove));
  };

  const getRecipienteForId = (recId: string) => recipientes.find(r => r.id === recId);
  const getLocalForId = (localId: string) => locaisDeEstoque.find(l => l.id === localId);

  const selectedCurrentRecipiente = getRecipienteForId(currentRecipienteId);
  const selectedCurrentLocal = getLocalForId(currentLocalId);

  const isLocalWithDivisions = selectedCurrentLocal?.tipo === 'armario' || selectedCurrentLocal?.tipo === 'prateleira';

  const currentHDivs = isLocalWithDivisions ? selectedCurrentLocal?.divisoes?.h || 1 : selectedCurrentRecipiente?.divisoes?.horizontais || 1;
  const currentVDivs = isLocalWithDivisions ? selectedCurrentLocal?.divisoes?.v || 1 : selectedCurrentRecipiente?.divisoes?.verticais || 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div ref={setModalContentRef} className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="flex flex-col flex-grow min-h-0">
          <div className="px-8 pt-8 pb-4 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-2xl font-bold text-gray-900">Lançamento de Estoque</h3>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto px-8 py-4">
            {error && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de Movimento</label>
                <select id="tipoMovimento" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={tipoMovimento} onChange={(e) => setTipoMovimento(e.target.value as 'entrada' | 'saida' | 'ajuste')} required disabled={!!initialData}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>
            </div>

            {initialData ? (
              selectedItem && (
                <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg border">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Produto</label>
                    <p className="mt-1 text-md font-semibold text-gray-900">{selectedItem.nome}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Quantidade a Lançar</label>
                    {/* Display quantities from lancamentoLocais */}
                    {lancamentoLocais.map((loc, index) => (
                      <p key={loc.id} className="mt-1 text-md font-semibold text-gray-900">
                        {loc.quantidade} em {locaisDeEstoque.find(l => l.id === loc.localId)?.nome} - {recipientes.find(r => r.id === loc.recipienteId)?.nome} ({loc.divisao?.h},{loc.divisao?.v})
                      </p>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700">Tipo de Produto</label>
                  <select id="tipoProduto" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={tipoProduto} onChange={(e) => { setTipoProduto(singularizeType(e.target.value)); setSelectedItem(null); }} required>
                    <option value="">Selecione o Tipo de Produto</option>
                    <option value="parte">Parte</option>
                    <option value="peca">Peça</option>
                    <option value="modelo">Modelo</option>
                    <option value="kit">Kit</option>
                    <option value="insumo">Insumo</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700">Produto</label>
                  <select
                    id="produto"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    value={selectedItem?.id || ''}
                    onChange={(e) => {
                      const selectedOption = produtosOptions.find(opt => opt.value === e.target.value);
                      handleProductSelect(selectedOption);
                    }}
                    disabled={!tipoProduto || loading}
                    required
                  >
                    <option value="">Selecione um produto...</option>
                    {produtosOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {selectedItem && (
              <>
                <div className="mt-4 p-4 bg-white rounded-lg shadow-inner border">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedItem.nome}</h3>
                  <p className="text-sm text-gray-600 mb-4">Estoque Total Atual: {selectedItem.currentEstoque}</p>

                  {/* Current Location Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Local</label>
                      <Select
                        options={locaisDeEstoque.filter(l => {
                          if (!l.id) return false;
                          if (['parte', 'peca', 'modelo', 'kit'].includes(tipoProduto)) {
                            return l.collectionType === 'locaisProdutos';
                          } else if (tipoProduto === 'insumo') {
                            return l.collectionType === 'locaisInsumos';
                          }
                          return false;
                        }).map(l => ({ value: l.id!, label: l.nome }))}
                        value={locaisDeEstoque.length > 0 && currentLocalId ? { value: currentLocalId, label: locaisDeEstoque.find(l => l.id === currentLocalId)?.nome || '' } : null}
                        onChange={opt => {
                          setCurrentLocalId(opt?.value || '');
                          const selectedLocal = locaisDeEstoque.find(l => l.id === opt?.value);
                          if (selectedLocal?.dimensoesGrade) {
                            setCurrentSelectedLocalDimensions(selectedLocal.dimensoesGrade);
                          } else {
                            setCurrentSelectedLocalDimensions(null);
                          }
                          setCurrentRecipienteId(''); // Reset recipient when local changes
                          setCurrentDivisao(null); // Reset division when local changes
                        }}
                        isDisabled={!!recipiente && lancamentoLocais.length === 0} // Disable if editing and no locations added yet
                        className="mt-1"
                      />
                    </div>
                    {locaisDeEstoque.find(l => l.id === currentLocalId)?.tipo !== 'armario' && locaisDeEstoque.find(l => l.id === currentLocalId)?.tipo !== 'prateleira' && (
                      <div className="flex items-end space-x-2">
                        <div className="flex-grow">
                          <label className="block text-sm font-medium text-gray-700">Recipiente</label>
                          <Select
                            options={recipientes
                              .filter(r => {
                                if (!r.id) return false;
                                if (tipoMovimento === 'saida') {
                                  // For 'saida', only show recipients that contain the selected product
                                  return r.localEstoqueId === currentLocalId && recipientHasSelectedProduct(r.id, selectedItem?.id);
                                } else {
                                  // For 'entrada' or 'ajuste', show recipients with available divisions (or same product)
                                  return r.localEstoqueId === currentLocalId && hasAvailableDivision(r.id, selectedItem?.id);
                                }
                              })
                              .map(r => {
                                const isOccupiedByCurrentProduct = occupiedRecipientsProductMap.get(r.id!) === selectedItem?.id;
                                const occupyingProduct = allProducts.find(p => p.id === occupiedRecipientsProductMap.get(r.id!));
                                const occupancyLabel = occupyingProduct ? ` (Contém: ${occupyingProduct.sku} - ${occupyingProduct.nome})` : '';
                                return {
                                  value: r.id!,
                                  label: `${r.nome} (${r.posicaoNaGrade.x},${r.posicaoNaGrade.y},${r.posicaoNaGrade.z})${occupancyLabel}`,
                                  isOccupiedByCurrentProduct: isOccupiedByCurrentProduct,
                                };
                              })}
                            value={recipientes.length > 0 && currentRecipienteId ? { value: currentRecipienteId, label: `${recipientes.find(r => r.id === currentRecipienteId)?.nome || ''} (${recipientes.find(r => r.id === currentRecipienteId)?.posicaoNaGrade.x ?? 0},${recipientes.find(r => r.id === currentRecipienteId)?.posicaoNaGrade.y ?? 0},${recipientes.find(r => r.id === currentRecipienteId)?.posicaoNaGrade.z ?? 0})` } : null}
                            onChange={opt => { setCurrentRecipienteId(opt?.value || ''); setCurrentDivisao(null); }}
                            isDisabled={!!recipiente && lancamentoLocais.length === 0 || !currentLocalId}
                            className="mt-1"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsRecipienteModalOpen(true)}
                          disabled={!currentLocalId || !currentSelectedLocalDimensions}
                          className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 flex-shrink-0"
                          title="Adicionar Novo Recipiente"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                    <input type="number" value={currentQuantidade} onChange={e => setCurrentQuantidade(parseInt(e.target.value) || 0)} min="1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
                  </div>
                  {(selectedCurrentRecipiente || (isLocalWithDivisions && currentLocalId)) && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">Divisão</label>
                      <div className="mt-1 grid gap-1 bg-gray-100 p-2 rounded-md" style={{ gridTemplateColumns: `repeat(${currentVDivs}, 1fr)`, gridTemplateRows: `repeat(${currentHDivs}, 1fr)` }}>
                        {Array.from({ length: currentHDivs * currentVDivs }).map((_, i) => {
                          const h = Math.floor(i / currentVDivs);
                          const v = i % currentVDivs;
                          const isSelected = currentDivisao?.h === h && currentDivisao?.v === v;

                          let occupancyInfo;
                          if (selectedCurrentRecipiente?.id) {
                            occupancyInfo = getDivisionOccupancyInfo(selectedCurrentRecipiente.id, h, v, selectedItem?.id);
                          } else if (isLocalWithDivisions && currentLocalId) {
                            // For armarios/prateleiras, check occupancy directly on the local
                            const localOccupants = (selectedCurrentLocal as LocalInsumo)?.ocupantes || [];
                            const existingOccupant = localOccupants.find(occ =>
                              occ.divisao?.h === h && occ.divisao?.v === v && occ.insumoId !== selectedItem?.id
                            );
                            occupancyInfo = {
                              occupied: !!existingOccupant,
                              byDifferent: !!existingOccupant,
                              productInfo: existingOccupant ? allProducts.find(p => p.id === existingOccupant.insumoId)?.nome : null,
                              productId: existingOccupant?.insumoId,
                            };
                          } else {
                            occupancyInfo = { occupied: false, byDifferent: false, productInfo: null, productId: null };
                          }

                          const isOccupiedBySelectedProduct = occupancyInfo.occupied && occupancyInfo.productId === selectedItem?.id;
                          const isAvailableForEntry = !occupancyInfo.occupied || isOccupiedBySelectedProduct;
                          const isAvailableForExit = occupancyInfo.occupied && occupancyInfo.productId === selectedItem?.id;

                          const isDisabled = tipoMovimento === 'entrada' ? !isAvailableForEntry : !isAvailableForExit;

                          const buttonClass = `p-2 text-xs rounded-md ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-white hover:bg-blue-50 text-gray-700 shadow-sm'} ${occupancyInfo.byDifferent ? 'border-2 border-red-500 cursor-not-allowed' : ''} ${isOccupiedBySelectedProduct && !isSelected ? 'bg-green-100 border border-green-500' : ''}`;

                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => !isDisabled && setCurrentDivisao({ h, v })}
                              className={buttonClass}
                              disabled={isDisabled}
                              title={occupancyInfo.occupied ? `Ocupado por: ${occupancyInfo.productInfo}` : `Divisão ${h},${v}`}
                            >
                              {occupancyInfo.occupied ? occupancyInfo.productInfo : `${h},${v}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={addLancamentoLocal}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
                      disabled={
                        !currentLocalId ||
                        (locaisDeEstoque.find(l => l.id === currentLocalId)?.tipo !== 'armario' &&
                          locaisDeEstoque.find(l => l.id === currentLocalId)?.tipo !== 'prateleira' &&
                          !currentRecipienteId) ||
                        currentDivisao === null ||
                        currentQuantidade <= 0
                      }
                    >
                      Adicionar Local de Lançamento
                    </button>
                  </div>
                </div>

                {/* Display Added Locations */}
                {lancamentoLocais.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Locais de Lançamento Adicionados:</h4>
                    <ul className="space-y-2">
                      {lancamentoLocais.map(loc => (
                        <li key={loc.id} className="flex justify-between items-center p-2 bg-white rounded-md shadow-sm border">
                          <span>
                            <strong>{loc.quantidade}</strong> em {locaisDeEstoque.find(l => l.id === loc.localId)?.nome} - {recipientes.find(r => r.id === loc.recipienteId)?.nome} ({loc.divisao?.h},{loc.divisao?.v})
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLancamentoLocal(loc.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"
                            title="Remover Local"
                          >
                            <X size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="mt-4">
              <label htmlFor="observacao" className="block text-sm font-medium text-gray-700">Observação (opcional):</label>
              <textarea id="observacao" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}></textarea>
            </div>
          </div>

          <div className="px-8 pt-4 pb-4 border-t border-gray-200 flex-shrink-0">
            <button type="button" className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400" disabled={loading || !selectedItem || lancamentoLocais.length === 0}>{loading ? 'Lançando...' : 'Confirmar Lançamento'}</button>
          </div>
        </form>

        {isRecipienteModalOpen && currentSelectedLocalDimensions && (
          <RecipienteFormModal
            isOpen={isRecipienteModalOpen}
            onClose={() => setIsRecipienteModalOpen(false)}
            onSave={handleSaveRecipiente}
            localEstoqueId={currentLocalId}
            existingRecipients={recipientes.filter(r => r.localEstoqueId === currentLocalId)}
            localDimensions={currentSelectedLocalDimensions}
          />
        )}
      </div>
    </div>
  );
};

export default EstoqueLancamentoModal;

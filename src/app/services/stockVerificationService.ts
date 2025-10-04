import { Pedido, Kit, Modelo, Peca, Parte, PosicaoEstoque, Insumo, GrupoDeFilamento, GrupoMontagem } from '../types';
import { LocalProduto, Recipiente, LocalInsumo } from '../types/mapaEstoque';

// --- Estruturas de Dados de Saída ---

export interface StockOption {
  type: 'kit' | 'modelo' | 'peca' | 'parte';
  id: string;
  nome: string;
  quantidadeNecessaria: number;
  quantidadeDisponivel: number;
  // A chave para a baixa no estoque
  posicoesEstoque: PosicaoEstoque[];
}

export interface ProductionNeed {
  // A necessidade de produção é sempre no nível mais baixo
  type: 'parte';
  id: string;
  nome: string;
  // Quantidade que realmente falta, após considerar estoque parcial
  quantidadeFaltante: number;
}

export interface StockVerificationResult {
  pedidoId: string;
  // Um booleano para a UI decidir rapidamente se abre o modal
  hasStockOptions: boolean;
  // Lista de itens que podem ser usados do estoque
  stockOptions: StockOption[];
  // Lista consolidada de partes que precisam ser produzidas
  productionNeeds: ProductionNeed[];
}

// --- Estrutura de Dados de Entrada ---

export interface AllProductsData {
  kits: Kit[];
  modelos: Modelo[];
  pecas: Peca[];
  partes: Parte[];
  insumos: Insumo[];
  filamentGroups: GrupoDeFilamento[];
  locaisProdutos: LocalProduto[];
  locaisInsumos: LocalInsumo[];
  recipientes: Recipiente[];
  assemblyGroups: GrupoMontagem[]; // Added for hierarchical summary
}

// --- Funções Utilitárias (Internas) ---

const enrichPosicoesEstoque = (
  posicoes: PosicaoEstoque[],
  allData: AllProductsData
): PosicaoEstoque[] => {
  if (!posicoes) return [];
  return posicoes.map(pos => {
    const recipiente = allData.recipientes.find(r => r.id === pos.recipienteId);
    if (!recipiente) return pos;

    const local = allData.locaisProdutos.find(l => l.id === recipiente.localEstoqueId);
    return {
      ...pos,
      localId: recipiente.localEstoqueId,
      localNome: local?.nome || 'N/A',
      posicaoNaGrade: recipiente.posicaoNaGrade,
    };
  });
};

const getItemFromData = (id: string, tipo: 'kit' | 'modelo' | 'peca' | 'parte', allData: AllProductsData) => {
  switch (tipo) {
    case 'kit':
      return allData.kits.find(k => k.id === id);
    case 'modelo':
      return allData.modelos.find(m => m.id === id);
    case 'peca':
      return allData.pecas.find(p => p.id === id);
    case 'parte':
      return allData.partes.find(p => p.id === id);
    default:
      return undefined;
  }
};

const calculateTotalStock = (item: Kit | Modelo | Peca | Parte): number => {
  const total = item.posicoesEstoque?.reduce((acc, pos) => acc + (pos.quantidade || 0), 0) || 0;
  console.log(`[calculateTotalStock] Item ${item.nome} (${item.id}), posicoesEstoque:`, item.posicoesEstoque, `Total: ${total}`);
  return total;
};


// --- Lógica Central (Funções Recursivas) ---

const findStockOrNeedsForParte = (
  parteId: string,
  quantidadeNecessaria: number,
  allData: AllProductsData
): { stockOptions: StockOption[]; productionNeeds: ProductionNeed[] } => {
  const parte = getItemFromData(parteId, 'parte', allData);
  if (!parte) return { stockOptions: [], productionNeeds: [] };

  const estoqueDisponivel = calculateTotalStock(parte);
  const stockOptions: StockOption[] = [];
  const productionNeeds: ProductionNeed[] = [];

  if (estoqueDisponivel > 0) {
    const quantidadeAtendida = Math.min(estoqueDisponivel, quantidadeNecessaria);
    const enrichedPositions = enrichPosicoesEstoque(parte.posicoesEstoque || [], allData);
    console.log(`[findStockOrNeedsForParte] Parte ${parte.nome} (${parte.id}): Estoque Disponível: ${estoqueDisponivel}, Quantidade Necessária: ${quantidadeNecessaria}, Quantidade Atendida: ${quantidadeAtendida}, Posições Enriquecidas:`, enrichedPositions);
    stockOptions.push({
      type: 'parte',
      id: parte.id,
      nome: parte.nome,
      quantidadeNecessaria: quantidadeNecessaria,
      quantidadeDisponivel: estoqueDisponivel, // Corrigido: Usar o estoque total disponível
      posicoesEstoque: enrichedPositions,
    });
  } else {
    console.log(`[findStockOrNeedsForParte] Parte ${parte.nome} (${parte.id}): Estoque Disponível: ${estoqueDisponivel} (não adicionado a stockOptions)`);
  }

  if (estoqueDisponivel < quantidadeNecessaria) {
    productionNeeds.push({
      type: 'parte',
      id: parte.id,
      nome: parte.nome,
      quantidadeFaltante: quantidadeNecessaria - estoqueDisponivel,
    });
  }

  return { stockOptions, productionNeeds };
};

const findStockOrNeedsForPeca = (
  pecaId: string,
  quantidadeNecessaria: number,
  allData: AllProductsData
): { stockOptions: StockOption[]; productionNeeds: ProductionNeed[] } => {
  const peca = getItemFromData(pecaId, 'peca', allData) as Peca | undefined;
  if (!peca) return { stockOptions: [], productionNeeds: [] };

  const estoqueDisponivel = calculateTotalStock(peca);
  let currentStockOptions: StockOption[] = [];
  let currentProductionNeeds: ProductionNeed[] = [];
  let remainingQuantity = quantidadeNecessaria;

  if (estoqueDisponivel > 0) {
    const quantidadeAtendida = Math.min(estoqueDisponivel, quantidadeNecessaria);
    currentStockOptions.push({
      type: 'peca',
      id: peca.id,
      nome: peca.nome,
      quantidadeNecessaria: quantidadeNecessaria,
      quantidadeDisponivel: estoqueDisponivel, // Corrigido: Usar o estoque total disponível
      posicoesEstoque: enrichPosicoesEstoque(peca.posicoesEstoque || [], allData),
    });
    remainingQuantity -= quantidadeAtendida;
    console.log(`[findStockOrNeedsForPeca] Peça ${peca.nome} (${peca.id}): Estoque Disponível: ${estoqueDisponivel}, Quantidade Atendida: ${quantidadeAtendida}, Quantidade Restante: ${remainingQuantity}`);
  } else {
    console.log(`[findStockOrNeedsForPeca] Peça ${peca.nome} (${peca.id}): Sem estoque direto, verificando partes...`);
  }

  if (remainingQuantity > 0) {
    // Se ainda há necessidade, verifica as partes
    for (const grupo of peca.gruposImpressao || []) {
      for (const componente of grupo.partes || []) {
          const { stockOptions, productionNeeds } = findStockOrNeedsForParte(
          componente.parteId,
          componente.quantidade * remainingQuantity, // Pass remainingQuantity to child calculation
          allData
          );
          currentStockOptions.push(...stockOptions);
          currentProductionNeeds.push(...productionNeeds);
      }
    }
  }

  return { stockOptions: currentStockOptions, productionNeeds: currentProductionNeeds };
};

const findStockOrNeedsForModelo = (
  modeloId: string,
  quantidadeNecessaria: number,
  allData: AllProductsData
): { stockOptions: StockOption[]; productionNeeds: ProductionNeed[] } => {
  const modelo = getItemFromData(modeloId, 'modelo', allData) as Modelo | undefined;
  if (!modelo) return { stockOptions: [], productionNeeds: [] };

  const estoqueDisponivel = calculateTotalStock(modelo);
  let currentStockOptions: StockOption[] = [];
  let currentProductionNeeds: ProductionNeed[] = [];
  let remainingQuantity = quantidadeNecessaria;

  if (estoqueDisponivel > 0) {
    const quantidadeAtendida = Math.min(estoqueDisponivel, quantidadeNecessaria);
    currentStockOptions.push({
      type: 'modelo',
      id: modelo.id,
      nome: modelo.nome,
      quantidadeNecessaria: quantidadeNecessaria,
      quantidadeDisponivel: estoqueDisponivel, // Corrigido: Usar o estoque total disponível
      posicoesEstoque: enrichPosicoesEstoque(modelo.posicoesEstoque || [], allData),
    });
    remainingQuantity -= quantidadeAtendida;
    console.log(`[findStockOrNeedsForModelo] Modelo ${modelo.nome} (${modelo.id}): Estoque Disponível: ${estoqueDisponivel}, Quantidade Atendida: ${quantidadeAtendida}, Quantidade Restante: ${remainingQuantity}`);
  } else {
    console.log(`[findStockOrNeedsForModelo] Modelo ${modelo.nome} (${modelo.id}): Sem estoque direto, verificando peças...`);
  }

  if (remainingQuantity > 0) {
    for (const componente of modelo.pecas || []) {
      const { stockOptions, productionNeeds } = findStockOrNeedsForPeca(
        componente.pecaId,
        componente.quantidade * remainingQuantity, // Pass remainingQuantity to child calculation
        allData
      );
      currentStockOptions.push(...stockOptions);
      currentProductionNeeds.push(...productionNeeds);
    }
  }

  return { stockOptions: currentStockOptions, productionNeeds: currentProductionNeeds };
};

const findStockOrNeedsForKit = (
  kitId: string,
  quantidadeNecessaria: number,
  allData: AllProductsData
): { stockOptions: StockOption[]; productionNeeds: ProductionNeed[] } => {
  const kit = getItemFromData(kitId, 'kit', allData) as Kit | undefined;
  if (!kit) return { stockOptions: [], productionNeeds: [] };

  const estoqueDisponivel = calculateTotalStock(kit);
  let currentStockOptions: StockOption[] = [];
  let currentProductionNeeds: ProductionNeed[] = [];
  let remainingQuantity = quantidadeNecessaria;

  if (estoqueDisponivel > 0) {
    const quantidadeAtendida = Math.min(estoqueDisponivel, quantidadeNecessaria);
    currentStockOptions.push({
      type: 'kit',
      id: kit.id,
      nome: kit.nome,
      quantidadeNecessaria: quantidadeNecessaria,
      quantidadeDisponivel: estoqueDisponivel, // Corrigido: Usar o estoque total disponível
      posicoesEstoque: enrichPosicoesEstoque(kit.posicoesEstoque || [], allData),
    });
    remainingQuantity -= quantidadeAtendida;
    console.log(`[findStockOrNeedsForKit] Kit ${kit.nome} (${kit.id}): Estoque Disponível: ${estoqueDisponivel}, Quantidade Atendida: ${quantidadeAtendida}, Quantidade Restante: ${remainingQuantity}`);
  } else {
    console.log(`[findStockOrNeedsForKit] Kit ${kit.nome} (${kit.id}): Sem estoque direto, verificando modelos...`);
  }

  if (remainingQuantity > 0) {
    for (const componente of kit.modelos || []) {
      const { stockOptions, productionNeeds } = findStockOrNeedsForModelo(
        componente.modeloId,
        componente.quantidade * remainingQuantity, // Pass remainingQuantity to child calculation
        allData
      );
      currentStockOptions.push(...stockOptions);
      currentProductionNeeds.push(...productionNeeds);
    }
  }

  return { stockOptions: currentStockOptions, productionNeeds: currentProductionNeeds };
};


// --- Função Principal (Ponto de Entrada) ---

export const verifyOrderStock = (pedido: Pedido, allData: AllProductsData): StockVerificationResult => {
  const finalResult: StockVerificationResult = {
    pedidoId: pedido.id,
    hasStockOptions: false,
    stockOptions: [],
    productionNeeds: [],
  };

  for (const produto of pedido.produtos) {
    let result: { stockOptions: StockOption[]; productionNeeds: ProductionNeed[] };

    switch (produto.tipo) {
      case 'kit':
        result = findStockOrNeedsForKit(produto.produtoId, produto.quantidade, allData);
        break;
      case 'modelo':
        result = findStockOrNeedsForModelo(produto.produtoId, produto.quantidade, allData);
        break;
      case 'peca':
        result = findStockOrNeedsForPeca(produto.produtoId, produto.quantidade, allData);
        break;
      default:
        result = { stockOptions: [], productionNeeds: [] };
    }
    
    finalResult.stockOptions.push(...result.stockOptions);
    finalResult.productionNeeds.push(...result.productionNeeds);
  }

  // Agrupar e somar as necessidades de produção para a mesma parte
  const aggregatedNeeds: { [key: string]: ProductionNeed } = {};
  for (const need of finalResult.productionNeeds) {
    if (aggregatedNeeds[need.id]) {
      aggregatedNeeds[need.id].quantidadeFaltante += need.quantidadeFaltante;
    } else {
      aggregatedNeeds[need.id] = { ...need };
    }
  }
  finalResult.productionNeeds = Object.values(aggregatedNeeds);
  
  finalResult.hasStockOptions = finalResult.stockOptions.length > 0;
  console.log("[verifyOrderStock] Final Stock Options:", finalResult.stockOptions);
  console.log("[verifyOrderStock] Has Stock Options:", finalResult.hasStockOptions);
  return finalResult;
};

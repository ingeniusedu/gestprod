import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// Interfaces locais baseadas na estrutura real
interface Peca {
  id: string;
  nome: string;
  tipoPeca: 'simples' | 'composta_um_grupo_sem_montagem' | 'composta_um_grupo_com_montagem' | 'composta_multiplos_grupos';
  SKU: string;
  estoqueTotal?: number;
  gruposImpressao: {
    quantidadeMaxima?: number;
    tempoImpressao: number;
    partes: {
      parteId: string;
      quantidade: number;
      hasAssembly?: boolean;
    }[];
    filamentos: {
      grupoFilamentoId: string;
      quantidade: number;
    }[];
    outrosInsumos?: {
      insumoId: string;
      quantidade: number;
    }[];
  }[];
  tempoMontagem?: string;
}

interface Modelo {
  id: string;
  nome: string;
  SKU: string;
  pecas: {
    pecaId: string;
    quantidade: number;
  }[];
  tempoMontagem?: number;
  tempoMontagemAdicional?: number;
  insumosAdicionais?: {
    insumoId: string;
    quantidade: number;
  }[];
}

interface Kit {
  id: string;
  nome: string;
  SKU: string;
  modelos?: {
    modeloId: string;
    quantidade: number;
  }[];
  componentes?: {
    id: string;
    nome: string;
    sku: string;
    quantidade: number;
    tipo: 'modelo' | 'peca';
  }[];
  insumosAdicionais?: {
    insumoId: string;
    nome: string;
    tipo: 'material' | 'tempo' | 'outros' | 'embalagem';
    quantidade: number;
  }[];
  custoCalculado?: number;
  tempoMontagem?: number;
  tempoMontagemAdicional?: number;
  consumoFilamento?: number;
  estoqueTotal?: number;
}

interface GrupoDeFilamento {
  id: string;
  nome: string;
  cor: string;
  pesoLiquido: number;
  fabricante?: string;
  material?: string;
  estoqueTotalGramas?: number;
  custoMedioPonderado?: number;
}

interface Insumo {
  id: string;
  nome: string;
  tipo: 'material' | 'tempo' | 'outros' | 'embalagem';
  unidade?: string;
  estoqueTotal?: number;
  estoqueAtual?: number;
  custoPorUnidade?: number;
  // Campos específicos para embalagem
  tipoEmbalagem?: string;
  materialEmbalagem?: string;
  altura?: number;
  largura?: number;
  profundidade?: number;
  dataCompraEmbalagem?: string;
  valorFrete?: number;
  valorTotalPago?: number;
  especificacoes?: any;
}

interface ServiceCosts {
  costPerMinute3DPrint: number;
  costPerMinuteAssembly: number;
  costPerMinutePackaging: number;
}

interface CustoDetalhado {
  filamento: number;
  impressao3D: number;
  montagem: number;
  insumos: number;
  total: number;
}

/**
 * Arredonda valor para 2 casas decimais (moeda)
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Obtém configurações de custos de serviço
 */
async function getServiceCosts(): Promise<ServiceCosts> {
  const db = admin.firestore();
  const settingsDoc = await db.collection('settings').doc('serviceCosts').get();
  if (settingsDoc.exists) {
    const data = settingsDoc.data();
    return {
      costPerMinute3DPrint: data?.costPerMinute3DPrint || 0,
      costPerMinuteAssembly: data?.costPerMinuteAssembly || 0,
      costPerMinutePackaging: data?.costPerMinutePackaging || 0,
    };
  }
  return {
    costPerMinute3DPrint: 0,
    costPerMinuteAssembly: 0,
    costPerMinutePackaging: 0,
  };
}

/**
 * Obtém custo médio ponderado de um grupo de filamento
 */
async function getCustoFilamento(grupoFilamentoId: string): Promise<number> {
  try {
    const db = admin.firestore();
    const grupoDoc = await db.collection('gruposDeFilamento').doc(grupoFilamentoId).get();
    if (grupoDoc.exists) {
      const grupo = grupoDoc.data() as GrupoDeFilamento;
      return grupo.custoMedioPonderado || 0;
    }
  } catch (error) {
    functions.logger.error(`Erro ao buscar custo do filamento ${grupoFilamentoId}:`, error);
  }
  return 0;
}

/**
 * Obtém custo por unidade de um insumo
 */
async function getCustoInsumo(insumoId: string): Promise<number> {
  try {
    const db = admin.firestore();
    const insumoDoc = await db.collection('insumos').doc(insumoId).get();
    if (insumoDoc.exists) {
      const insumo = insumoDoc.data() as Insumo;
      return insumo.custoPorUnidade || 0;
    }
  } catch (error) {
    functions.logger.error(`Erro ao buscar custo do insumo ${insumoId}:`, error);
  }
  return 0;
}

/**
 * Calcula custo de uma peça
 */
export async function calcularCustoPeca(pecaId: string, pecaData?: Peca): Promise<{ custo: number; detalhado: CustoDetalhado }> {
  let peca: Peca;
  
  if (!pecaData) {
    const db = admin.firestore();
    const pecaDoc = await db.collection('pecas').doc(pecaId).get();
    if (!pecaDoc.exists) {
      throw new Error(`Peça ${pecaId} não encontrada`);
    }
    peca = pecaDoc.data() as Peca;
  } else {
    peca = pecaData;
  }

  const serviceCosts = await getServiceCosts();
  const detalhado: CustoDetalhado = {
    filamento: 0,
    impressao3D: 0,
    montagem: 0,
    insumos: 0,
    total: 0,
  };

  // Calcular custo por grupo de impressão
  for (const grupo of peca.gruposImpressao) {
    // Custo de impressão 3D
    const tempoImpressao = parseFloat(grupo.tempoImpressao?.toString() || "0");
    const custoImpressaoGrupo = roundToTwoDecimals(tempoImpressao * serviceCosts.costPerMinute3DPrint);
    detalhado.impressao3D = roundToTwoDecimals(detalhado.impressao3D + custoImpressaoGrupo);

    // Custo de filamentos
    for (const filamento of grupo.filamentos) {
      const quantidade = parseFloat(filamento.quantidade?.toString() || "0");
      const custoPorGramaL = await getCustoFilamento(filamento.grupoFilamentoId);
      const custoFilamento = roundToTwoDecimals(quantidade * custoPorGramaL);
      detalhado.filamento = roundToTwoDecimals(detalhado.filamento + custoFilamento);
    }

    // Custo de outros insumos do grupo
    if (grupo.outrosInsumos) {
      for (const insumo of grupo.outrosInsumos) {
        const quantidade = parseFloat(insumo.quantidade?.toString() || "0");
        const custoPorUnidade = await getCustoInsumo(insumo.insumoId);
        const custoInsumo = roundToTwoDecimals(quantidade * custoPorUnidade);
        detalhado.insumos = roundToTwoDecimals(detalhado.insumos + custoInsumo);
      }
    }
  }

  // Custo de montagem da peça
  const tempoMontagemPeca = parseFloat((peca as any).tempoMontagem?.toString() || "0");
  detalhado.montagem = roundToTwoDecimals(tempoMontagemPeca * serviceCosts.costPerMinuteAssembly);

  // Calcular total com arredondamento
  detalhado.total = roundToTwoDecimals(
    detalhado.filamento + detalhado.impressao3D + detalhado.montagem + detalhado.insumos
  );

  return {
    custo: detalhado.total,
    detalhado
  };
}

/**
 * Calcula custo de um modelo
 */
export async function calcularCustoModelo(modeloId: string, modeloData?: Modelo): Promise<{ custo: number; detalhado: CustoDetalhado }> {
  let modelo: Modelo;
  
  if (!modeloData) {
    const db = admin.firestore();
    const modeloDoc = await db.collection('modelos').doc(modeloId).get();
    if (!modeloDoc.exists) {
      throw new Error(`Modelo ${modeloId} não encontrado`);
    }
    modelo = modeloDoc.data() as Modelo;
  } else {
    modelo = modeloData;
  }

  const serviceCosts = await getServiceCosts();
  const detalhado: CustoDetalhado = {
    filamento: 0,
    impressao3D: 0,
    montagem: 0,
    insumos: 0,
    total: 0,
  };

  // Custo das peças do modelo - usa custoDetalhado armazenado se disponível
  const db = admin.firestore();
  for (const pecaItem of modelo.pecas) {
    let detalhadoPeca: CustoDetalhado;
    
    // Tenta obter custoDetalhado armazenado da peça
    const pecaDoc = await db.collection('pecas').doc(pecaItem.pecaId).get();
    if (pecaDoc.exists && pecaDoc.data()?.custoDetalhado) {
      // Usa custoDetalhado armazenado
      detalhadoPeca = pecaDoc.data()!.custoDetalhado as CustoDetalhado;
    } else {
      // Se não tiver armazenado, calcula do zero
      const result = await calcularCustoPeca(pecaItem.pecaId);
      detalhadoPeca = result.detalhado;
    }
    
    const quantidade = pecaItem.quantidade;
    
    // Soma os componentes do custo detalhado da peça com arredondamento
    detalhado.filamento = roundToTwoDecimals(detalhado.filamento + (detalhadoPeca.filamento * quantidade));
    detalhado.impressao3D = roundToTwoDecimals(detalhado.impressao3D + (detalhadoPeca.impressao3D * quantidade));
    detalhado.montagem = roundToTwoDecimals(detalhado.montagem + (detalhadoPeca.montagem * quantidade));
    detalhado.insumos = roundToTwoDecimals(detalhado.insumos + (detalhadoPeca.insumos * quantidade));
  }

  // Custo de montagem adicional do modelo (apenas tempo adicional, pois montagem das peças já está contada)
  const tempoMontagemAdicional = (modelo as any).tempoMontagemAdicional || 0;
  const custoMontagemAdicional = roundToTwoDecimals(tempoMontagemAdicional * serviceCosts.costPerMinuteAssembly);
  detalhado.montagem = roundToTwoDecimals(detalhado.montagem + custoMontagemAdicional);

  // Custo de insumos adicionais do modelo
  const insumosAdicionais = (modelo as any).insumosAdicionais || [];
  for (const insumo of insumosAdicionais) {
    const quantidade = parseFloat(insumo.quantidade?.toString() || "0");
    const custoPorUnidade = await getCustoInsumo(insumo.insumoId);
    const custoInsumo = roundToTwoDecimals(quantidade * custoPorUnidade);
    detalhado.insumos = roundToTwoDecimals(detalhado.insumos + custoInsumo);
  }

  // Calcular total com arredondamento
  detalhado.total = roundToTwoDecimals(
    detalhado.filamento + detalhado.impressao3D + detalhado.montagem + detalhado.insumos
  );

  return {
    custo: detalhado.total,
    detalhado
  };
}

/**
 * Calcula custo de um kit
 */
export async function calcularCustoKit(kitId: string, kitData?: Kit): Promise<{ custo: number; detalhado: CustoDetalhado }> {
  let kit: Kit;
  const db = admin.firestore();
  
  if (!kitData) {
    const kitDoc = await db.collection('kits').doc(kitId).get();
    if (!kitDoc.exists) {
      throw new Error(`Kit ${kitId} não encontrado`);
    }
    kit = kitDoc.data() as Kit;
  } else {
    kit = kitData;
  }

  const serviceCosts = await getServiceCosts();
  const detalhado: CustoDetalhado = {
    filamento: 0,
    impressao3D: 0,
    montagem: 0,
    insumos: 0,
    total: 0,
  };

  // Custo dos componentes do kit (modelos ou peças)
  if (kit.modelos && kit.modelos.length > 0) {
    for (const modeloItem of kit.modelos) {
      let detalhadoModelo: CustoDetalhado;
      
      // Tenta obter custoDetalhado armazenado do modelo
      const modeloDoc = await db.collection('modelos').doc(modeloItem.modeloId).get();
      if (modeloDoc.exists && modeloDoc.data()?.custoDetalhado) {
        // Usa custoDetalhado armazenado
        detalhadoModelo = modeloDoc.data()!.custoDetalhado as CustoDetalhado;
      } else {
        // Se não tiver armazenado, calcula do zero
        const result = await calcularCustoModelo(modeloItem.modeloId);
        detalhadoModelo = result.detalhado;
      }
      
      const quantidade = modeloItem.quantidade;
      detalhado.filamento = roundToTwoDecimals(detalhado.filamento + (detalhadoModelo.filamento * quantidade));
      detalhado.impressao3D = roundToTwoDecimals(detalhado.impressao3D + (detalhadoModelo.impressao3D * quantidade));
      detalhado.montagem = roundToTwoDecimals(detalhado.montagem + (detalhadoModelo.montagem * quantidade));
      detalhado.insumos = roundToTwoDecimals(detalhado.insumos + (detalhadoModelo.insumos * quantidade));
    }
  } else if (kit.componentes && kit.componentes.length > 0) {
    for (const componente of kit.componentes) {
      let detalhadoComponente: CustoDetalhado;
      
      if (componente.tipo === 'modelo') {
        // Tenta obter custoDetalhado armazenado do modelo
        const modeloDoc = await db.collection('modelos').doc(componente.id).get();
        if (modeloDoc.exists && modeloDoc.data()?.custoDetalhado) {
          detalhadoComponente = modeloDoc.data()!.custoDetalhado as CustoDetalhado;
        } else {
          const result = await calcularCustoModelo(componente.id);
          detalhadoComponente = result.detalhado;
        }
      } else if (componente.tipo === 'peca') {
        // Tenta obter custoDetalhado armazenado da peça
        const pecaDoc = await db.collection('pecas').doc(componente.id).get();
        if (pecaDoc.exists && pecaDoc.data()?.custoDetalhado) {
          detalhadoComponente = pecaDoc.data()!.custoDetalhado as CustoDetalhado;
        } else {
          const result = await calcularCustoPeca(componente.id);
          detalhadoComponente = result.detalhado;
        }
      } else {
        continue;
      }
      
      const quantidade = componente.quantidade;
      detalhado.filamento = roundToTwoDecimals(detalhado.filamento + (detalhadoComponente.filamento * quantidade));
      detalhado.impressao3D = roundToTwoDecimals(detalhado.impressao3D + (detalhadoComponente.impressao3D * quantidade));
      detalhado.montagem = roundToTwoDecimals(detalhado.montagem + (detalhadoComponente.montagem * quantidade));
      detalhado.insumos = roundToTwoDecimals(detalhado.insumos + (detalhadoComponente.insumos * quantidade));
    }
  }

  // Custo de montagem do kit (apenas tempo adicional, pois montagem dos componentes já está contada)
  const tempoMontagemAdicional = kit.tempoMontagemAdicional || 0;
  const custoMontagemAdicional = roundToTwoDecimals(tempoMontagemAdicional * serviceCosts.costPerMinuteAssembly);
  detalhado.montagem = roundToTwoDecimals(detalhado.montagem + custoMontagemAdicional);

  // Custo de insumos adicionais do kit
  if (kit.insumosAdicionais) {
    for (const insumo of kit.insumosAdicionais) {
      const quantidade = parseFloat(insumo.quantidade?.toString() || "0");
      const custoPorUnidade = await getCustoInsumo(insumo.insumoId);
      const custoInsumo = roundToTwoDecimals(quantidade * custoPorUnidade);
      detalhado.insumos = roundToTwoDecimals(detalhado.insumos + custoInsumo);
    }
  }

  // Calcular total com arredondamento
  detalhado.total = roundToTwoDecimals(
    detalhado.filamento + detalhado.impressao3D + detalhado.montagem + detalhado.insumos
  );

  return {
    custo: detalhado.total,
    detalhado
  };
}

/**
 * Função principal para recalcular custo de um produto
 */
export async function recalcularCustoProduto(produtoId: string, tipo: 'peca' | 'modelo' | 'kit'): Promise<{ custo: number; detalhado: CustoDetalhado }> {
  functions.logger.log(`Recalculando custo do produto ${produtoId} (tipo: ${tipo})`);
  
  let result: { custo: number; detalhado: CustoDetalhado };
  
  switch (tipo) {
    case 'peca':
      result = await calcularCustoPeca(produtoId);
      break;
    case 'modelo':
      result = await calcularCustoModelo(produtoId);
      break;
    case 'kit':
      result = await calcularCustoKit(produtoId);
      break;
    default:
      throw new Error(`Tipo de produto inválido: ${tipo}`);
  }

  // Atualizar documento com novo custo calculado
  const db = admin.firestore();
  const collectionName = tipo === 'peca' ? 'pecas' : tipo === 'modelo' ? 'modelos' : 'kits';
  
  // Aplicar arredondamento para 2 casas decimais em todos os valores
  const detalhadoArredondado: CustoDetalhado = {
    filamento: roundToTwoDecimals(result.detalhado.filamento),
    impressao3D: roundToTwoDecimals(result.detalhado.impressao3D),
    montagem: roundToTwoDecimals(result.detalhado.montagem),
    insumos: roundToTwoDecimals(result.detalhado.insumos),
    total: roundToTwoDecimals(result.detalhado.total)
  };
  
  // Salvar apenas custoDetalhado (removendo campos duplicados)
  await db.collection(collectionName).doc(produtoId).update({
    custoDetalhado: detalhadoArredondado,
    custoCalculadoAtualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  });

  functions.logger.log(`Custo recalculado para ${produtoId}: R$ ${detalhadoArredondado.total.toFixed(2)}`);
  
  return result;
}

/**
 * Encontra e recalcula produtos que dependem de um filamento
 */
export async function recalcularProdutosComFilamento(grupoFilamentoId: string): Promise<void> {
  functions.logger.log(`Recalculando produtos com filamento ${grupoFilamentoId}`);
  
  const db = admin.firestore();
  // Buscar peças que usam este filamento
  const pecasQuery = await db.collection('pecas')
    .where('gruposImpressao.filamentos.grupoFilamentoId', '==', grupoFilamentoId)
    .get();
  
  for (const pecaDoc of pecasQuery.docs) {
    try {
      await recalcularCustoProduto(pecaDoc.id, 'peca');
      // Propagar para modelos que usam esta peça
      await propagarParaModelos(pecaDoc.id);
    } catch (error) {
      functions.logger.error(`Erro ao recalcular peça ${pecaDoc.id}:`, error);
    }
  }
}

/**
 * Encontra e recalcula produtos que dependem de um insumo
 */
export async function recalcularProdutosComInsumo(insumoId: string): Promise<void> {
  functions.logger.log(`Recalculando produtos com insumo ${insumoId}`);
  
  const db = admin.firestore();
  // Buscar peças que usam este insumo em outrosInsumos
  const pecasQuery = await db.collection('pecas')
    .where('gruposImpressao.outrosInsumos.insumoId', '==', insumoId)
    .get();
  
  for (const pecaDoc of pecasQuery.docs) {
    try {
      await recalcularCustoProduto(pecaDoc.id, 'peca');
      await propagarParaModelos(pecaDoc.id);
    } catch (error) {
      functions.logger.error(`Erro ao recalcular peça ${pecaDoc.id}:`, error);
    }
  }
  
  // Buscar modelos que usam este insumo em insumosAdicionais
  const modelosQuery = await db.collection('modelos')
    .where('insumosAdicionais.insumoId', '==', insumoId)
    .get();
  
  for (const modeloDoc of modelosQuery.docs) {
    try {
      await recalcularCustoProduto(modeloDoc.id, 'modelo');
      await propagarParaKits(modeloDoc.id);
    } catch (error) {
      functions.logger.error(`Erro ao recalcular modelo ${modeloDoc.id}:`, error);
    }
  }
  
  // Buscar kits que usam este insumo em insumosAdicionais
  const kitsQuery = await db.collection('kits')
    .where('insumosAdicionais.insumoId', '==', insumoId)
    .get();
  
  for (const kitDoc of kitsQuery.docs) {
    try {
      await recalcularCustoProduto(kitDoc.id, 'kit');
    } catch (error) {
      functions.logger.error(`Erro ao recalcular kit ${kitDoc.id}:`, error);
    }
  }
}

/**
 * Propaga recálculo para modelos que usam uma peça
 */
async function propagarParaModelos(pecaId: string): Promise<void> {
  const db = admin.firestore();
  const modelosQuery = await db.collection('modelos')
    .where('pecas.pecaId', '==', pecaId)
    .get();
  
  for (const modeloDoc of modelosQuery.docs) {
    try {
      await recalcularCustoProduto(modeloDoc.id, 'modelo');
      // Propagar para kits que usam este modelo
      await propagarParaKits(modeloDoc.id);
    } catch (error) {
      functions.logger.error(`Erro ao propagar para modelo ${modeloDoc.id}:`, error);
    }
  }
}

/**
 * Propaga recálculo para kits que usam um modelo
 */
async function propagarParaKits(modeloId: string): Promise<void> {
  const db = admin.firestore();
  // Kits com modelos
  const kitsComModelosQuery = await db.collection('kits')
    .where('modelos.modeloId', '==', modeloId)
    .get();
  
  for (const kitDoc of kitsComModelosQuery.docs) {
    try {
      await recalcularCustoProduto(kitDoc.id, 'kit');
    } catch (error) {
      functions.logger.error(`Erro ao propagar para kit ${kitDoc.id}:`, error);
    }
  }
  
  // Kits com componentes do tipo modelo
  const kitsComComponentesQuery = await db.collection('kits')
    .where('componentes', 'array-contains', {
      id: modeloId,
      tipo: 'modelo'
    })
    .get();
  
  for (const kitDoc of kitsComComponentesQuery.docs) {
    try {
      await recalcularCustoProduto(kitDoc.id, 'kit');
    } catch (error) {
      functions.logger.error(`Erro ao propagar para kit ${kitDoc.id}:`, error);
    }
  }
}

/**
 * Recalcula TODAS as peças do zero
 */
export async function recalcularTodasPecas(): Promise<void> {
  functions.logger.log("Recalculando TODAS as peças do zero");
  
  const db = admin.firestore();
  const pecasSnapshot = await db.collection('pecas').get();
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const pecaDoc of pecasSnapshot.docs) {
    try {
      await recalcularCustoProduto(pecaDoc.id, 'peca');
      successCount++;
    } catch (error) {
      functions.logger.error(`Erro ao recalcular peça ${pecaDoc.id}:`, error);
      errorCount++;
    }
  }
  
  functions.logger.log(`Recálculo de peças concluído: ${successCount} sucessos, ${errorCount} erros`);
}

/**
 * Recalcula TODOS os modelos do zero
 */
export async function recalcularTodosModelos(): Promise<void> {
  functions.logger.log("Recalculando TODOS os modelos do zero");
  
  const db = admin.firestore();
  const modelosSnapshot = await db.collection('modelos').get();
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const modeloDoc of modelosSnapshot.docs) {
    try {
      await recalcularCustoProduto(modeloDoc.id, 'modelo');
      successCount++;
    } catch (error) {
      functions.logger.error(`Erro ao recalcular modelo ${modeloDoc.id}:`, error);
      errorCount++;
    }
  }
  
  functions.logger.log(`Recálculo de modelos concluído: ${successCount} sucessos, ${errorCount} erros`);
}

/**
 * Recalcula TODOS os kits do zero
 */
export async function recalcularTodosKits(): Promise<void> {
  functions.logger.log("Recalculando TODOS os kits do zero");
  
  const db = admin.firestore();
  const kitsSnapshot = await db.collection('kits').get();
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const kitDoc of kitsSnapshot.docs) {
    try {
      await recalcularCustoProduto(kitDoc.id, 'kit');
      successCount++;
    } catch (error) {
      functions.logger.error(`Erro ao recalcular kit ${kitDoc.id}:`, error);
      errorCount++;
    }
  }
  
  functions.logger.log(`Recálculo de kits concluído: ${successCount} sucessos, ${errorCount} erros`);
}

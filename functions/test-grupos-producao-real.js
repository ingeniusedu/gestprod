// Teste com dados reais baseados no payload mostrado pelo usuário

console.log('=== TESTE COM DADOS REAIS ===\n');

// Dados do payload real
const payloadReal = {
  pedidoId: "GZ2ZMZQapraPQldznfsF",
  nivelUsado: 3,
  produtoRaiz: {
    id: "lab8UHknYyzgUYlbhxxF",
    tipo: "kit",
    quantidade: 1
  },
  produtosConsumidos: [
    { nivel: 3, produtoId: "lab8UHknYyzgUYlbhxxF", produtoTipo: "kit", quantidade: 1 },
    { nivel: 5, produtoId: "eeoEZhH6N449BiLKtwyp", produtoTipo: "modelo", quantidade: 1 },
    { nivel: 7, produtoId: "SzKhXq8tiCWUimE06ycE", produtoTipo: "peca", quantidade: 1 },
    { nivel: 7, produtoId: "yfj5JP3F32SQP9HcEoHV", produtoTipo: "peca", quantidade: 1 },
    { nivel: 7, produtoId: "63I1fKBSglotHXh1ndqq", produtoTipo: "peca", quantidade: 1 },
    { nivel: 7, produtoId: "Wg686mPj77M8dqFrfSei", produtoTipo: "peca", quantidade: 1 },
    { nivel: 5, produtoId: "yfj5JP3F32SQP9HcEoHV", produtoTipo: "peca", quantidade: 1 },
    { nivel: 5, produtoId: "SzKhXq8tiCWUimE06ycE", produtoTipo: "peca", quantidade: 1 },
    { nivel: 5, produtoId: "63I1fKBSglotHXh1ndqq", produtoTipo: "peca", quantidade: 1 },
    { nivel: 5, produtoId: "Wg686mPj77M8dqFrfSei", produtoTipo: "peca", quantidade: 1 }
  ],
  gruposMontagemAfetados: [
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1",
      grupoMontagemId: "WSGbKlUxExyyZvcZ4QSZ"
    },
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1",
      grupoMontagemId: "IhCgpYL9PnL8fQfVDUWR"
    },
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1",
      grupoMontagemId: "HqysidokJydZLElSenyn"
    },
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-yfj5JP3F32SQP9HcEoHV-1",
      grupoMontagemId: "c9GN7yYr7KbcH7NigAfO"
    },
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-yfj5JP3F32SQP9HcEoHV-1",
      grupoMontagemId: "ql4faVLKAB9nk87QojqJ"
    },
    {
      assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-SzKhXq8tiCWUimE06ycE-1",
      grupoMontagemId: "vOAGqb19kycvlSsvjPZV"
    }
  ],
  gruposProducaoAfetados: [] // Vazio no payload real
};

// Simulação de grupos de produção que poderiam existir
const gruposProducaoSimulados = [
  {
    id: "grupo-producao-001",
    sourceId: "SzKhXq8tiCWUimE06ycE",
    sourceType: "peca",
    sourceName: "Grupo de Impressão Peça SzKhXq8tiCWUimE06ycE",
    partesNoGrupo: {
      "SzKhXq8tiCWUimE06ycE": {
        nome: "Peça SzKhXq8tiCWUimE06ycE",
        quantidade: 10,
        hasAssembly: true
      },
      "parte-001": {
        nome: "Parte 001",
        quantidade: 5,
        hasAssembly: false
      }
    },
    pedidosOrigem: [
      {
        pedidoId: "GZ2ZMZQapraPQldznfsF",
        pedidoNumero: "TESTE-001",
        assemblyInstances: [
          {
            assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1",
            quantidadeRequerida: 1,
            atendimentoDetalhado: []
          }
        ]
      }
    ]
  },
  {
    id: "grupo-producao-002",
    sourceId: "yfj5JP3F32SQP9HcEoHV",
    sourceType: "peca",
    sourceName: "Grupo de Impressão Peça yfj5JP3F32SQP9HcEoHV",
    partesNoGrupo: {
      "yfj5JP3F32SQP9HcEoHV": {
        nome: "Peça yfj5JP3F32SQP9HcEoHV",
        quantidade: 8,
        hasAssembly: true
      },
      "parte-002": {
        nome: "Parte 002",
        quantidade: 4,
        hasAssembly: false
      }
    },
    pedidosOrigem: [
      {
        pedidoId: "GZ2ZMZQapraPQldznfsF",
        pedidoNumero: "TESTE-001",
        assemblyInstances: [
          {
            assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-yfj5JP3F32SQP9HcEoHV-1",
            quantidadeRequerida: 1,
            atendimentoDetalhado: []
          },
          {
            assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-yfj5JP3F32SQP9HcEoHV-1",
            quantidadeRequerida: 1,
            atendimentoDetalhado: []
          }
        ]
      }
    ]
  },
  {
    id: "grupo-producao-003",
    sourceId: "63I1fKBSglotHXh1ndqq",
    sourceType: "peca",
    sourceName: "Grupo de Impressão Peça 63I1fKBSglotHXh1ndqq",
    partesNoGrupo: {
      "63I1fKBSglotHXh1ndqq": {
        nome: "Peça 63I1fKBSglotHXh1ndqq",
        quantidade: 6,
        hasAssembly: true
      }
    },
    pedidosOrigem: [
      {
        pedidoId: "GZ2ZMZQapraPQldznfsF",
        pedidoNumero: "TESTE-001",
        assemblyInstances: [
          {
            assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-63I1fKBSglotHXh1ndqq-1",
            quantidadeRequerida: 1,
            atendimentoDetalhado: []
          }
        ]
      }
    ]
  },
  {
    id: "grupo-producao-004",
    sourceId: "Wg686mPj77M8dqFrfSei",
    sourceType: "peca",
    sourceName: "Grupo de Impressão Peça Wg686mPj77M8dqFrfSei",
    partesNoGrupo: {
      "Wg686mPj77M8dqFrfSei": {
        nome: "Peça Wg686mPj77M8dqFrfSei",
        quantidade: 7,
        hasAssembly: true
      }
    },
    pedidosOrigem: [
      {
        pedidoId: "GZ2ZMZQapraPQldznfsF",
        pedidoNumero: "TESTE-001",
        assemblyInstances: [
          {
            assemblyInstanceId: "GZ2ZMZQapraPQldznfsF-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-Wg686mPj77M8dqFrfSei-1",
            quantidadeRequerida: 1,
            atendimentoDetalhado: []
          }
        ]
      }
    ]
  }
];

// Função parseAssemblyInstanceId simulada
function parseAssemblyInstanceId(assemblyInstanceId) {
  const parts = assemblyInstanceId.split('-');
  return {
    pedidoId: parts[0],
    kitId: parts.length > 2 ? parts[1] : undefined,
    modeloId: parts.length > 3 ? parts[2] : (parts.length > 1 ? parts[1] : undefined),
    pecaId: parts[parts.length - 2],
    instanceNumber: parseInt(parts[parts.length - 1]) || 1
  };
}

// Função coletarPartesDoNode simulada
function coletarPartesDoNode(node) {
  // Para simplificar, assumimos que os nós de peça já são as partes
  const partes = [];
  
  const coletarRecursivo = (currentNode) => {
    if (currentNode.tipo === 'parte' && currentNode.targetProductId) {
      partes.push(currentNode.targetProductId);
    }
    
    if (currentNode.children) {
      currentNode.children.forEach(filho => coletarRecursivo(filho));
    }
  };
  
  coletarRecursivo(node);
  return partes;
}

// Função mapearGruposProducaoAfetados (versão simplificada para teste)
function mapearGruposProducaoAfetados(operations, cache) {
  console.log('DEBUG [mapearGruposProducaoAfetados]: Iniciando mapeamento');
  console.log('  - Operações:', operations.length);
  console.log('  - Grupos de produção disponíveis:', cache.gruposProducao.length);
  
  const gruposAfetadosMap = new Map();
  const { gruposProducao, hierarquia } = cache;
  
  // Para cada operação pendente
  operations.forEach((op, opIndex) => {
    const { stockItem, targetNode, quantity } = op;
    
    console.log(`\n  DEBUG [Op ${opIndex}]: ${stockItem.nome} (${stockItem.tipo}) → ${targetNode.nome} (${targetNode.tipo})`);
    console.log(`    - Quantidade: ${quantity}`);
    console.log(`    - targetProductId: ${targetNode.targetProductId}`);
    
    // Coletar todas as partes associadas a este nó
    const partesDoNode = coletarPartesDoNode(targetNode);
    console.log(`    - Partes encontradas (${partesDoNode.length}):`, partesDoNode);
    
    // Se não encontrou partes, usar o targetProductId diretamente
    const idsParaBuscar = partesDoNode.length > 0 ? partesDoNode : targetNode.targetProductId ? [targetNode.targetProductId] : [];
    
    if (idsParaBuscar.length === 0) {
      console.log(`    - AVISO: Nenhum ID para buscar`);
      return;
    }
    
    // Encontrar grupos de produção que contêm qualquer uma das partes
    const gruposRelevantes = gruposProducao.filter(grupo => {
      // Verificar se o grupo contém qualquer uma das partes nas partesNoGrupo
      const contemParte = idsParaBuscar.some(parteId => 
        grupo.partesNoGrupo && grupo.partesNoGrupo[parteId] !== undefined
      );
      
      if (contemParte) {
        console.log(`    - Grupo ${grupo.id} contém parte`);
        return true;
      }
      
      // Verificar se o grupo tem o sourceId igual ao targetProductId
      if (grupo.sourceId === targetNode.targetProductId) {
        console.log(`    - Grupo ${grupo.id} tem sourceId igual`);
        return true;
      }
      
      // Verificar se algum pedidoOrigem tem assemblyInstances que correspondem
      if (grupo.pedidosOrigem) {
        const temAssemblyInstances = grupo.pedidosOrigem.some(pedidoOrigem => 
          pedidoOrigem.assemblyInstances?.some(instance => {
            if (!instance.assemblyInstanceId) return false;
            const parsed = parseAssemblyInstanceId(instance.assemblyInstanceId);
            return idsParaBuscar.some(id => 
              parsed.pecaId === id ||
              parsed.modeloId === id ||
              parsed.kitId === id
            );
          })
        );
        
        if (temAssemblyInstances) {
          console.log(`    - Grupo ${grupo.id} tem assemblyInstances correspondentes`);
          return true;
        }
      }
      
      return false;
    });
    
    console.log(`    - Grupos relevantes encontrados: ${gruposRelevantes.length}`);
    
    // Para cada grupo relevante, adicionar/modificar no mapa
    gruposRelevantes.forEach(grupo => {
      if (!grupo.id) return;
      
      const grupoKey = grupo.id;
      if (!gruposAfetadosMap.has(grupoKey)) {
        gruposAfetadosMap.set(grupoKey, {
          grupoProducaoId: grupo.id,
          assemblyInstances: new Set(),
          modificacoes: {}
        });
      }
      
      const grupoData = gruposAfetadosMap.get(grupoKey);
      
      // Coletar assemblyInstances associados a este grupo
      if (grupo.pedidosOrigem) {
        grupo.pedidosOrigem.forEach(pedidoOrigem => {
          pedidoOrigem.assemblyInstances?.forEach(instance => {
            if (instance.assemblyInstanceId) {
              grupoData.assemblyInstances.add(instance.assemblyInstanceId);
            }
          });
        });
      }
      
      // Adicionar modificação para cada parte consumida
      idsParaBuscar.forEach(parteId => {
        if (grupo.partesNoGrupo?.[parteId]) {
          const campo = `partesNoGrupo.${parteId}.quantidade`;
          const valorAtual = grupoData.modificacoes[campo] || 0;
          // Valor negativo indica consumo (redução)
          const quantidadePorParte = quantity / idsParaBuscar.length;
          grupoData.modificacoes[campo] = valorAtual - quantidadePorParte;
          
          console.log(`    - Modificação: ${campo} = ${grupoData.modificacoes[campo]} (${quantidadePorParte} por parte)`);
        }
      });
    });
  });
  
  // Converter mapa para array
  const resultado = Array.from(gruposAfetadosMap.values()).map(grupo => ({
    grupoProducaoId: grupo.grupoProducaoId,
    assemblyInstances: Array.from(grupo.assemblyInstances),
    modificacoes: grupo.modificacoes
  }));
  
  console.log('\n  DEBUG [mapearGruposProducaoAfetados]: Resultado final');
  console.log(`  - Total de grupos afetados: ${resultado.length}`);
  resultado.forEach((g, i) => {
    console.log(`    [${i}] ${g.grupoProducaoId}: ${g.assemblyInstances.length} assemblyInstances, ${Object.keys(g.modificacoes).length} modificações`);
  });
  
  return resultado;
}

// Criar operações simuladas baseadas no payload
const operationsSimuladas = [
  {
    stockItem: {
      id: "lab8UHknYyzgUYlbhxxF",
      nome: "Kit Teste",
      tipo: "kit",
      quantidade: 5,
      produtoId: "lab8UHknYyzgUYlbhxxF"
    },
    targetNode: {
      id: "node-kit",
      nome: "Kit Teste",
      tipo: "kit",
      targetProductId: "lab8UHkn

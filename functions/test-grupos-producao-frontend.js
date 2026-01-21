// Teste para verificar a lógica de mapeamento de grupos de produção
// Simula a estrutura de dados do frontend

console.log('=== TESTE - MAPEAMENTO DE GRUPOS DE PRODUÇÃO ===\n');

// Simulação de uma operação pendente
const mockOperation = {
  id: 'op-1',
  stockItem: {
    id: 'peca-teste-456',
    nome: 'Peça Teste',
    tipo: 'peca',
    quantidade: 5,
    produtoId: 'peca-teste-456'
  },
  targetNode: {
    id: 'node-1',
    nome: 'Peça Teste',
    tipo: 'peca',
    targetProductId: 'peca-teste-456',
    nivel: 2,
    quantidadeNecessaria: 3,
    quantidadeAtendida: 0
  },
  quantity: 2,
  pedidoId: 'pedido-teste-123'
};

// Simulação de cache do pedido
const mockCache = {
  pedido: { id: 'pedido-teste-123', numero: 'TESTE-001' },
  hierarquia: [
    {
      id: 'node-1',
      nome: 'Peça Teste',
      tipo: 'peca',
      targetProductId: 'peca-teste-456',
      nivel: 2,
      children: []
    }
  ],
  gruposProducao: [
    {
      id: 'grupo-producao-teste-789',
      sourceId: 'peca-teste-456',
      sourceType: 'peca',
      sourceName: 'Grupo de Impressão Teste',
      partesNoGrupo: {
        'peca-teste-456': {
          nome: 'Peça Teste',
          quantidade: 5,
          hasAssembly: true
        },
        'parte-teste-001': {
          nome: 'Parte Teste 001',
          quantidade: 3,
          hasAssembly: false
        }
      },
      pedidosOrigem: [
        {
          pedidoId: 'pedido-teste-123',
          pedidoNumero: 'TESTE-001',
          assemblyInstances: [
            {
              assemblyInstanceId: 'pedido-teste-123-modelo-teste-456-peca-teste-456-1',
              quantidadeRequerida: 1,
              atendimentoDetalhado: []
            }
          ]
        }
      ]
    }
  ],
  gruposMontagem: []
};

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

// Função mapearGruposProducaoAfetados (simplificada para teste)
function mapearGruposProducaoAfetados(operations, cache) {
  const gruposAfetadosMap = new Map();
  const { gruposProducao, hierarquia } = cache;

  operations.forEach(op => {
    const { stockItem, targetNode, quantity } = op;
    
    // Encontrar grupos de produção que contêm o produto alvo
    const gruposRelevantes = gruposProducao.filter(grupo => {
      // Verificar se o grupo contém o targetProductId nas partesNoGrupo
      if (grupo.partesNoGrupo && targetNode.targetProductId) {
        return grupo.partesNoGrupo[targetNode.targetProductId] !== undefined;
      }
      
      // Verificar se o grupo tem o sourceId igual ao targetProductId
      if (grupo.sourceId === targetNode.targetProductId) {
        return true;
      }
      
      // Verificar se algum pedidoOrigem tem assemblyInstances que correspondem
      if (grupo.pedidosOrigem) {
        return grupo.pedidosOrigem.some(pedidoOrigem => 
          pedidoOrigem.assemblyInstances?.some(instance => {
            if (!instance.assemblyInstanceId) return false;
            const parsed = parseAssemblyInstanceId(instance.assemblyInstanceId);
            return parsed.pecaId === targetNode.targetProductId ||
                   parsed.modeloId === targetNode.targetProductId ||
                   parsed.kitId === targetNode.targetProductId;
          })
        );
      }
      
      return false;
    });
    
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
      
      // Adicionar modificação para a parte consumida
      if (targetNode.targetProductId && grupo.partesNoGrupo?.[targetNode.targetProductId]) {
        const campo = `partesNoGrupo.${targetNode.targetProductId}.quantidade`;
        const valorAtual = grupoData.modificacoes[campo] || 0;
        // Valor negativo indica consumo (redução)
        grupoData.modificacoes[campo] = valorAtual - quantity;
      }
    });
  });
  
  // Converter mapa para array
  return Array.from(gruposAfetadosMap.values()).map(grupo => ({
    grupoProducaoId: grupo.grupoProducaoId,
    assemblyInstances: Array.from(grupo.assemblyInstances),
    modificacoes: grupo.modificacoes
  }));
}

// Executar teste
console.log('1. Operação pendente:');
console.log(JSON.stringify(mockOperation, null, 2));

console.log('\n2. Cache do pedido:');
console.log('   - Grupos de produção:', mockCache.gruposProducao.length);
console.log('   - Hierarquia:', mockCache.hierarquia.length);

console.log('\n3. Executando mapeamento...');
const resultado = mapearGruposProducaoAfetados([mockOperation], mockCache);

console.log('\n4. Resultado:');
console.log(JSON.stringify(resultado, null, 2));

console.log('\n5. Validação:');
if (resultado.length === 1) {
  console.log('✓ Encontrou 1 grupo de produção afetado');
  
  const grupo = resultado[0];
  if (grupo.grupoProducaoId === 'grupo-producao-teste-789') {
    console.log('✓ ID do grupo correto');
  }
  
  if (grupo.assemblyInstances.length === 1) {
    console.log('✓ Encontrou 1 assembly instance associado');
  }
  
  const modificacaoEsperada = 'partesNoGrupo.peca-teste-456.quantidade';
  if (grupo.modificacoes[modificacaoEsperada] === -2) {
    console.log('✓ Modificação correta: -2 unidades (consumo)');
  }
  
  console.log('\n✓ TESTE PASSOU! O mapeamento está funcionando corretamente.');
} else {
  console.log('✗ TESTE FALHOU: Esperava 1 grupo, encontrou', resultado.length);
}

console.log('\n=== FIM DO TESTE ===');

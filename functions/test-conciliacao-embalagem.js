// Teste para validar a conciliação multi-nível na função de embalagem
const admin = require('firebase-admin');

// Mock do logger
const logger = {
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.log('[WARN]', msg, ...args),
  error: (msg, ...args) => console.log('[ERROR]', msg, ...args)
};

// Payload exemplo fornecido
const payloadExemplo = {
  pedidoId: 'ped-123-001',
  nivelUsado: 5,
  produtoRaiz: {
    id: 'ped-123-001-kit-001',
    tipo: 'kit',
    quantidade: 2
  },
  produtosConsumidos: [
    {
      produtoId: 'ped-123-001-kit-001',
      produtoTipo: 'kit',
      quantidade: 2,
      nivel: 3
    },
    {
      produtoId: 'modelo-001',
      produtoTipo: 'modelo',
      quantidade: 3,
      nivel: 5,
      parentKitId: 'ped-123-001-kit-001',
      assemblyInstanceId: 'ped-123-kit-001-modelo-001-1'
    },
    {
      produtoId: 'peca-001',
      produtoTipo: 'peca',
      quantidade: 2,
      nivel: 7,
      parentModeloId: 'modelo-001',
      parentKitId: 'ped-123-001-kit-001',
      assemblyInstanceId: 'ped-123-kit-001-modelo-001-peca-001-1'
    },
    {
      produtoId: 'peca-002',
      produtoTipo: 'peca',
      quantidade: 1,
      nivel: 7,
      parentModeloId: 'modelo-001',
      parentKitId: 'ped-123-001-kit-001',
      assemblyInstanceId: 'ped-123-kit-001-modelo-001-peca-002-1'
    }
  ],
  posicoesConsumidas: [],
  gruposMontagemAfetados: [
    {
      grupoMontagemId: 'grupo-kit-001',
      assemblyInstanceId: 'ped-123-kit-001',
      modificacoes: [
        {
          campo: 'atendimentoDetalhado',
          valor: {
            produtoRaizId: 'ped-123-001-kit-001',
            produtoRaizTipo: 'kit',
            origem: 'estoque_kit',
            quantidade: 2
          }
        }
      ]
    },
    {
      grupoMontagemId: 'grupo-modelo-001',
      assemblyInstanceId: 'ped-123-kit-001-modelo-001-1',
      modificacoes: [
        {
          campo: 'atendimentoDetalhado',
          valor: {
            produtoRaizId: 'modelo-001',
            produtoRaizTipo: 'modelo',
            origem: 'estoque_modelo',
            quantidade: 3
          }
        }
      ]
    }
  ],
  timestamp: new Date().toISOString()
};

// Estrutura simulada do grupo de embalagem
const grupoEmbalagemSimulado = {
  id: 'grupo-embalagem-001',
  pedidoId: 'ped-123-001',
  targetProductType: 'produto_final',
  produtosFinaisNecessarios: [
    {
      produtoId: 'ped-123-001-kit-001', // Corrigido para corresponder ao produto consumido
      nome: 'Kit Principal',
      tipo: 'kit',
      quantidade: 2,
      atendimentoDetalhado: [],
      quantidadeAtendida: 0,
      modelos: [
        {
          modeloId: 'modelo-001',
          nome: 'Modelo Principal',
          quantidade: 4,
          quantidadeAtendida: 0,
          pecas: [
            {
              pecaId: 'peca-001',
              nome: 'Peça 1',
              quantidade: 4,
              quantidadeAtendida: 0
            },
            {
              pecaId: 'peca-002',
              nome: 'Peça 2',
              quantidade: 2,
              quantidadeAtendida: 0
            }
          ]
        }
      ]
    }
  ]
};

// Função para extrair assemblyInstanceId (corrigida)
function extrairAssemblyInstanceIdDoProdutoConsumido(produtoConsumido, produtoRaiz) {
  const { produtoId, produtoTipo, nivel, assemblyInstanceId } = produtoConsumido;
  const { id: raizId, tipo: raizTipo } = produtoRaiz;
  
  // Se já temos assemblyInstanceId no payload, usar ele
  if (assemblyInstanceId) {
    return assemblyInstanceId;
  }
  
  // Senão, construir baseado no nível
  if (nivel === 3) {
    // Kit raiz: "pedidoId-kitId-1"
    // Ex: "ped-123-kit-001-1"
    const pedidoId = raizId.split('-')[0] + '-' + raizId.split('-')[1];
    const kitId = raizId.split('-')[2] + '-' + raizId.split('-')[3];
    return `${pedidoId}-${kitId}-1`;
  } else if (nivel === 5) {
    // Modelo em kit: "pedidoId-kitId-1-modeloId-1"
    // Ex: "ped-123-kit-001-1-modelo-001-1"
    const pedidoId = raizId.split('-')[0] + '-' + raizId.split('-')[1];
    const kitId = raizId.split('-')[2] + '-' + raizId.split('-')[3];
    return `${pedidoId}-${kitId}-1-${produtoId}-1`;
  } else if (nivel === 7) {
    // Peça em modelo: "pedidoId-kitId-1-modeloId-1-pecaId-1"
    // Ex: "ped-123-kit-001-1-modelo-001-peca-001-1"
    const pedidoId = raizId.split('-')[0] + '-' + raizId.split('-')[1];
    const kitId = raizId.split('-')[2] + '-' + raizId.split('-')[3];
    return `${pedidoId}-${kitId}-1-${produtoConsumido.parentModeloId}-${produtoId}-1`;
  }
  
  return null;
}

// Função para conciliar kit raiz (nível 3)
function conciliarKitRaiz(produtosFinais, produtoConsumido) {
  return produtosFinais.map(produto => {
    if (produto.produtoId === produtoConsumido.produtoId && produto.tipo === 'kit') {
      const origem = `estoque_${produtoConsumido.produtoTipo}`;
      const timestamp = new Date();
      
      const atendimentoExistente = produto.atendimentoDetalhado?.find(a => a.origem === origem);
      const quantidadeAtual = atendimentoExistente?.quantidade || 0;
      
      logger.info(`Conciliando kit raiz ${produto.produtoId}: ${quantidadeAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtual + produtoConsumido.quantidade}`);
      
      return {
        ...produto,
        quantidadeAtendida: (produto.quantidadeAtendida || 0) + produtoConsumido.quantidade,
        atendimentoDetalhado: [
          ...(produto.atendimentoDetalhado || []),
          {
            origem,
            quantidade: produtoConsumido.quantidade,
            timestamp
          }
        ]
      };
    }
    return produto;
  });
}

// Função para conciliar modelo em kit (nível 5)
function conciliarModeloEmKit(produtosFinais, produtoConsumido) {
  return produtosFinais.map(produto => {
    if (produto.tipo === 'kit' && produto.modelos) {
      const modelosAtualizados = produto.modelos.map(modelo => {
        if (modelo.modeloId === produtoConsumido.produtoId) {
          const origem = `estoque_${produtoConsumido.produtoTipo}`;
          const timestamp = new Date();
          
          logger.info(`Conciliando modelo ${modelo.modeloId} em kit: ${modelo.quantidadeAtendida || 0} + ${produtoConsumido.quantidade} = ${(modelo.quantidadeAtendida || 0) + produtoConsumido.quantidade}`);
          
          return {
            ...modelo,
            quantidadeAtendida: (modelo.quantidadeAtendida || 0) + produtoConsumido.quantidade
          };
        }
        return modelo;
      });
      
      return { ...produto, modelos: modelosAtualizados };
    }
    return produto;
  });
}

// Função para conciliar peça em modelo (nível 7)
function conciliarPecaEmModelo(produtosFinais, produtoConsumido) {
  return produtosFinais.map(produto => {
    if (produto.tipo === 'kit' && produto.modelos) {
      const modelosAtualizados = produto.modelos.map(modelo => {
        if (modelo.pecas) {
          const pecasAtualizadas = modelo.pecas.map(peca => {
            if (peca.pecaId === produtoConsumido.produtoId) {
              const origem = `estoque_${produtoConsumido.produtoTipo}`;
              const timestamp = new Date();
              
              logger.info(`Conciliando peça ${peca.pecaId} em modelo: ${peca.quantidadeAtendida || 0} + ${produtoConsumido.quantidade} = ${(peca.quantidadeAtendida || 0) + produtoConsumido.quantidade}`);
              
              return {
                ...peca,
                quantidadeAtendida: (peca.quantidadeAtendida || 0) + produtoConsumido.quantidade
              };
            }
            return peca;
          });
          
          return { ...modelo, pecas: pecasAtualizadas };
        }
        return modelo;
      });
      
      return { ...produto, modelos: modelosAtualizados };
    }
    return produto;
  });
}

// Função principal de conciliação no nível correto
function conciliarProdutoNoNivelCorreto(produtosFinais, produtoConsumido, assemblyInstanceId) {
  logger.info(`Conciliando produto ${produtoConsumido.produtoId} (nível ${produtoConsumido.nivel}) com assemblyInstanceId: ${assemblyInstanceId}`);
  
  // Usar o nível diretamente do produtoConsumido em vez de tentar inferir do assemblyInstanceId
  if (produtoConsumido.nivel === 3) {
    logger.info(`  -> Detectado nível 3 (kit raiz)`);
    return conciliarKitRaiz(produtosFinais, produtoConsumido);
  } else if (produtoConsumido.nivel === 5) {
    logger.info(`  -> Detectado nível 5 (modelo em kit)`);
    return conciliarModeloEmKit(produtosFinais, produtoConsumido);
  } else if (produtoConsumido.nivel === 7) {
    logger.info(`  -> Detectado nível 7 (peça em modelo)`);
    return conciliarPecaEmModelo(produtosFinais, produtoConsumido);
  }
  
  logger.warn(`  -> Nível não reconhecido: ${produtoConsumido.nivel}`);
  return produtosFinais;
}

// Função para verificar se todos os produtos foram atendidos
function verificarTodosProdutosAtendidos(produtosFinais) {
  return produtosFinais.every(produto => {
    const totalAtendido = produto.atendimentoDetalhado?.reduce(
      (sum, item) => sum + item.quantidade, 0
    ) || 0;
    const atendido = totalAtendido >= produto.quantidade;
    
    logger.info(`Verificação produto ${produto.produtoId}: necessário=${produto.quantidade}, atendido=${totalAtendido}, OK=${atendido}`);
    
    if (produto.tipo === 'kit' && produto.modelos) {
      const modelosAtendidos = produto.modelos.every(modelo => {
        const totalAtendidoModelo = modelo.quantidadeAtendida || 0;
        const modeloAtendido = totalAtendidoModelo >= modelo.quantidade;
        
        logger.info(`  Modelo ${modelo.modeloId}: necessário=${modelo.quantidade}, atendido=${totalAtendidoModelo}, OK=${modeloAtendido}`);
        
        if (modelo.pecas) {
          const pecasAtendidas = modelo.pecas.every(peca => {
            const totalAtendidoPeca = peca.quantidadeAtendida || 0;
            const pecaAtendida = totalAtendidoPeca >= peca.quantidade;
            
            logger.info(`    Peça ${peca.pecaId}: necessário=${peca.quantidade}, atendido=${totalAtendidoPeca}, OK=${pecaAtendida}`);
            return pecaAtendida;
          });
          return modeloAtendido && pecasAtendidas;
        }
        
        return modeloAtendido;
      });
      return atendido && modelosAtendidos;
    }
    
    return atendido;
  });
}

// Função principal de teste
function testarConciliacaoEmbalagem() {
  console.log('=== INICIANDO TESTE DE CONCILIAÇÃO MULTI-NÍVEL ===\n');
  
  const { produtosConsumidos, produtoRaiz } = payloadExemplo;
  let produtosFinais = [...grupoEmbalagemSimulado.produtosFinaisNecessarios];
  
  console.log('Estado inicial dos produtos finais:');
  console.log(JSON.stringify(produtosFinais, null, 2));
  console.log('\n');
  
  // Processar cada produto consumido
  for (const produtoConsumido of produtosConsumidos) {
    console.log(`\n=== Processando produto consumido: ${produtoConsumido.produtoTipo} ${produtoConsumido.produtoId} (nível ${produtoConsumido.nivel}) ===`);
    
    // Extrair assemblyInstanceId
    const assemblyInstanceId = extrairAssemblyInstanceIdDoProdutoConsumido(produtoConsumido, produtoRaiz);
    
    if (!assemblyInstanceId) {
      console.warn(`AssemblyInstanceId não pode ser extraído para produto: ${produtoConsumido.produtoId}`);
      continue;
    }
    
    console.log(`AssemblyInstanceId calculado: ${assemblyInstanceId}`);
    
    // Conciliar no nível correto
    produtosFinais = conciliarProdutoNoNivelCorreto(
      produtosFinais,
      produtoConsumido,
      assemblyInstanceId
    );
  }
  
  console.log('\n=== VALIDANDO CONSISTÊNCIA HIERÁRQUICA ===');
  const todosAtendidos = verificarTodosProdutosAtendidos(produtosFinais);
  
  console.log('\n=== RESULTADO FINAL ===');
  console.log('Produtos finais após conciliação:');
  console.log(JSON.stringify(produtosFinais, null, 2));
  console.log(`\nTodos atendidos: ${todosAtendidos}`);
  console.log(`Status final: ${todosAtendidos ? 'produzido_aguardando_embalagem' : 'em_montagem'}`);
  
  // Verificações específicas
  console.log('\n=== VERIFICAÇÕES ESPECÍFICAS ===');
  const kitFinal = produtosFinais[0];
  console.log(`Kit - Quantidade necessária: ${kitFinal.quantidade}, Atendida: ${kitFinal.quantidadeAtendida}`);
  
  const modeloFinal = kitFinal.modelos[0];
  console.log(`Modelo - Quantidade necessária: ${modeloFinal.quantidade}, Atendida: ${modeloFinal.quantidadeAtendida}`);
  
  const peca1Final = modeloFinal.pecas[0];
  console.log(`Peça 1 - Quantidade necessária: ${peca1Final.quantidade}, Atendida: ${peca1Final.quantidadeAtendida}`);
  
  const peca2Final = modeloFinal.pecas[1];
  console.log(`Peça 2 - Quantidade necessária: ${peca2Final.quantidade}, Atendida: ${peca2Final.quantidadeAtendida}`);
  
  // Resultado esperado:
  // Kit: 2/2 = 100% (atendido pelo consumo de kit nível 3)
  // Modelo: 3/4 = 75% (atendido pelo consumo de modelo nível 5)
  // Peça 1: 2/4 = 50% (atendida pelo consumo de peça nível 7)
  // Peça 2: 1/2 = 50% (atendida pelo consumo de peça nível 7)
}

// Executar o teste
testarConciliacaoEmbalagem();
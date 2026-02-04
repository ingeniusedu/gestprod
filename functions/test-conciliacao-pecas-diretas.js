// Teste específico para validar atendimento de peças diretas do kit
const logger = {
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.log('[WARN]', msg, ...args),
  error: (msg, ...args) => console.log('[ERROR]', msg, ...args)
};

// Payload de teste: atendendo com kit que tem modelo E peças diretas
const payloadTeste = {
  pedidoId: 'ped-123-002',
  nivelUsado: 5,
  produtoRaiz: {
    id: 'kit-001',
    tipo: 'kit',
    quantidade: 1
  },
  produtosConsumidos: [
    {
      produtoId: 'kit-001',
      produtoTipo: 'kit',
      quantidade: 1,
      nivel: 3 // Kit raiz
    }
  ],
  posicoesConsumidas: [],
  gruposMontagemAfetados: [],
  timestamp: new Date().toISOString()
};

// Estrutura do grupo de embalagem com kit contendo modelo E peças diretas
const grupoEmbalagemSimulado = {
  id: 'grupo-embalagem-002',
  pedidoId: 'ped-123-002',
  targetProductType: 'produto_final',
  produtosFinaisNecessarios: [
    {
      produtoId: 'kit-001',
      nome: 'Kit com Modelo e Peças Diretas',
      tipo: 'kit',
      quantidade: 1,
      atendimentoDetalhado: [],
      quantidadeAtendida: 0,
      modelos: [
        {
          modeloId: 'modelo-001',
          nome: 'Modelo dentro do Kit',
          quantidade: 1,
          quantidadeAtendida: 0,
          pecas: [
            {
              pecaId: 'peca-modelo-001',
              nome: 'Peça do Modelo',
              quantidade: 2,
              quantidadeAtendida: 0
            }
          ]
        }
      ],
      pecas: [ // ✅ PEÇAS DIRETAS DO KIT (NÍVEL 1)
        {
          pecaId: 'peca-direta-001',
          nome: 'Peça Direta do Kit',
          quantidade: 3,
          quantidadeAtendida: 0
        },
        {
          pecaId: 'peca-direta-002',
          nome: 'Outra Peça Direta',
          quantidade: 2,
          quantidadeAtendida: 0
        }
      ]
    }
  ]
};

// Função simplificada de conciliação de kit raiz (baseada na implementação)
function conciliarKitRaizSimplificado(produtosFinais, produtoConsumido) {
  return produtosFinais.map((produto) => {
    if (produto.produtoId === produtoConsumido.produtoId && produto.tipo === 'kit') {
      const origem = `estoque_${produtoConsumido.produtoTipo}`;
      const timestamp = new Date();
      
      const atendimentoExistente = produto.atendimentoDetalhado?.find((a) => a.origem === origem);
      const quantidadeAtual = atendimentoExistente?.quantidade || 0;
      
      logger.info(`Conciliando kit raiz ${produto.produtoId}: ${quantidadeAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtual + produtoConsumido.quantidade}`);
      
      // Criar produto atualizado base
      const produtoAtualizado = {
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

      // ✅ NOVO: Atender peças diretas do kit (nível 1)
      if (produto.pecas) {
        const pecasAtualizadas = produto.pecas.map((peca) => {
          const quantidadeAtendidaAtual = peca.quantidadeAtendida || 0;
          logger.info(`  Atendendo peça direta do kit ${peca.pecaId}: ${quantidadeAtendidaAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtendidaAtual + produtoConsumido.quantidade}`);
          
          return {
            ...peca,
            quantidadeAtendida: quantidadeAtendidaAtual + produtoConsumido.quantidade
          };
        });
        
        produtoAtualizado.pecas = pecasAtualizadas;
        logger.info(`  Peças diretas do kit atualizadas: ${pecasAtualizadas.length} peças atendidas`);
      }

      return produtoAtualizado;
    }
    return produto;
  });
}

// Função principal de teste
function testarConciliacaoPecasDiretas() {
  console.log('=== TESTE ESPECÍFICO: PEÇAS DIRETAS DO KIT ===\n');
  
  const { produtosConsumidos } = payloadTeste;
  let produtosFinais = [...grupoEmbalagemSimulado.produtosFinaisNecessarios];
  
  console.log('Estado inicial:');
  console.log('Kit:', {
    id: produtosFinais[0].produtoId,
    quantidadeNecessaria: produtosFinais[0].quantidade,
    quantidadeAtendida: produtosFinais[0].quantidadeAtendida
  });
  
  console.log('Peças diretas do kit:');
  produtosFinais[0].pecas.forEach(peca => {
    console.log(`  ${peca.pecaId}: necessário=${peca.quantidade}, atendido=${peca.quantidadeAtendida}`);
  });
  
  console.log('\nProcessando produto consumido:', produtosConsumidos[0]);
  
  // Aplicar conciliação
  produtosFinais = conciliarKitRaizSimplificado(produtosFinais, produtosConsumidos[0]);
  
  console.log('\n=== RESULTADO APÓS CONCILIAÇÃO ===');
  
  const kitAtualizado = produtosFinais[0];
  console.log('Kit atualizado:', {
    id: kitAtualizado.produtoId,
    quantidadeNecessaria: kitAtualizado.quantidade,
    quantidadeAtendida: kitAtualizado.quantidadeAtendida,
    status: kitAtualizado.quantidadeAtendida >= kitAtualizado.quantidade ? 'ATENDIDO' : 'PARCIAL'
  });
  
  console.log('\nPeças diretas do kit após conciliação:');
  kitAtualizado.pecas.forEach(peca => {
    const status = peca.quantidadeAtendida >= peca.quantidade ? 'ATENDIDA' : 'PARCIAL';
    console.log(`  ${peca.pecaId}: necessário=${peca.quantidade}, atendido=${peca.quantidadeAtendida}, status=${status}`);
  });
  
  // Verificação final
  const todasPecasDiretasAtendidas = kitAtualizado.pecas.every(peca => 
    peca.quantidadeAtendida >= peca.quantidade
  );
  
  console.log(`\n=== VALIDAÇÃO FINAL ===`);
  console.log(`Kit atendido: ${kitAtualizado.quantidadeAtendida >= kitAtualizado.quantidade ? 'SIM' : 'NÃO'}`);
  console.log(`Todas peças diretas atendidas: ${todasPecasDiretasAtendidas ? 'SIM' : 'NÃO'}`);
  console.log(`Status geral: ${todasPecasDiretasAtendidas ? 'SUCESSO' : 'FALHA'}`);
}

// Executar o teste
testarConciliacaoPecasDiretas();
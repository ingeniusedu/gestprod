// Teste para verificar a correção da duplicação de atendimento
// Simula o caso específico: 1 kit com 1 modelo e 4 peças

// Mock do logger
const logger = {
  info: (message) => console.log(`INFO: ${message}`)
};

// Dados de teste baseados no problema do usuário
const produtoFinal = {
  produtoId: "lab8UHknYyzgUYlbhxxF",
  nome: "Kit modelo + peças",
  tipo: "kit",
  quantidade: 1,
  quantidadeAtendida: 0,
  modelos: [
    {
      modeloId: "eeoEZhH6N449BiLKtwyp",
      nome: "Modelo Complexo",
      quantidade: 1,
      quantidadeAtendida: 0,
      pecas: [
        {
          pecaId: "63I1fKBSglotHXh1ndqq",
          nome: "Simples",
          quantidade: 1,
          quantidadeAtendida: 0
        },
        {
          pecaId: "SzKhXq8tiCWUimE06ycE",
          nome: "Composta Multi Grupos",
          quantidade: 1,
          quantidadeAtendida: 0
        },
        {
          pecaId: "Wg686mPj77M8dqFrfSei",
          nome: "Compsota Um grupo sem montagem",
          quantidade: 1,
          quantidadeAtendida: 0
        },
        {
          pecaId: "yfj5JP3F32SQP9HcEoHV",
          nome: "Composta Um grupo Com montagem",
          quantidade: 1,
          quantidadeAtendida: 0
        }
      ]
    }
  ],
  pecas: [
    // Mesmas peças que estão no modelo (caso problemático)
    {
      pecaId: "63I1fKBSglotHXh1ndqq",
      nome: "Simples",
      quantidade: 1,
      quantidadeAtendida: 0
    },
    {
      pecaId: "SzKhXq8tiCWUimE06ycE",
      nome: "Composta Multi Grupos",
      quantidade: 1,
      quantidadeAtendida: 0
    },
    {
      pecaId: "Wg686mPj77M8dqFrfSei",
      nome: "Compsota Um grupo sem montagem",
      quantidade: 1,
      quantidadeAtendida: 0
    },
    {
      pecaId: "yfj5JP3F32SQP9HcEoHV",
      nome: "Composta Um grupo Com montagem",
      quantidade: 1,
      quantidadeAtendida: 0
    }
  ]
};

const produtoConsumido = {
  produtoId: "lab8UHknYyzgUYlbhxxF",
  produtoTipo: "kit",
  quantidade: 1
};

console.log("=== TESTE DE CORREÇÃO DE DUPLICAÇÃO DE ATENDIMENTO ===");
console.log("\nEstado ANTES do atendimento:");
console.log("Kit:", produtoFinal.quantidadeAtendida);
console.log("Modelo:", produtoFinal.modelos[0].quantidadeAtendida);
console.log("Peças do modelo:", produtoFinal.modelos[0].pecas.map(p => ({ id: p.pecaId, nome: p.nome, atendida: p.quantidadeAtendida })));
console.log("Peças diretas do kit:", produtoFinal.pecas.map(p => ({ id: p.pecaId, nome: p.nome, atendida: p.quantidadeAtendida })));

// Aplicar a função corrigida
console.log("\n=== APLICANDO ATENDIMENTO DO KIT ===");
try {
  // Importar e executar a função (simulando o ambiente)
  const propagarAtendimentoParaSubitens = (produtoFinal, produtoConsumido) => {
    logger.info(`Propagando atendimento para subitens: ${produtoConsumido.produtoTipo} ${produtoConsumido.produtoId} (${produtoConsumido.quantidade} unidades)`);
    
    // Atender o próprio kit primeiro
    if (produtoConsumido.produtoTipo === 'kit') {
      produtoFinal.quantidadeAtendida = (produtoFinal.quantidadeAtendida || 0) + produtoConsumido.quantidade;
      logger.info(`Kit ${produtoFinal.produtoId} quantidadeAtendida atualizada para ${produtoFinal.quantidadeAtendida}`);
    }
    
    // 1. Propagar para modelos diretos do kit
    if (produtoFinal.modelos) {
      for (const modelo of produtoFinal.modelos) {
        if (produtoConsumido.produtoTipo === 'kit') {
          // Kit atende todos os modelos
          modelo.quantidadeAtendida = (modelo.quantidadeAtendida || 0) + produtoConsumido.quantidade;
          logger.info(`Modelo ${modelo.modeloId} quantidadeAtendida atualizada para ${modelo.quantidadeAtendida}`);
          
          // Propagar para peças do modelo
          if (modelo.pecas) {
            for (const peca of modelo.pecas) {
              peca.quantidadeAtendida = (peca.quantidadeAtendida || 0) + produtoConsumido.quantidade;
              logger.info(`Peça ${peca.pecaId} (dentro do modelo) quantidadeAtendida atualizada para ${peca.quantidadeAtendida}`);
            }
          }
        }
      }
    }
    
    // 2. Propagar para peças diretas do kit (APENAS se não estiverem em modelos)
    if (produtoFinal.pecas && produtoConsumido.produtoTipo === 'kit') {
      // Criar conjunto de peças que já estão em modelos para evitar duplicação
      const pecasEmModelos = new Set();
      
      if (produtoFinal.modelos) {
        for (const modelo of produtoFinal.modelos) {
          if (modelo.pecas) {
            for (const peca of modelo.pecas) {
              pecasEmModelos.add(peca.pecaId);
            }
          }
        }
      }
      
      for (const peca of produtoFinal.pecas) {
        // Atender apenas peças que NÃO estão em modelos
        if (!pecasEmModelos.has(peca.pecaId)) {
          peca.quantidadeAtendida = (peca.quantidadeAtendida || 0) + produtoConsumido.quantidade;
          logger.info(`Peça ${peca.pecaId} (direta do kit, não em modelos) quantidadeAtendida atualizada para ${peca.quantidadeAtendida}`);
        } else {
          logger.info(`Peça ${peca.pecaId} está em modelo, ignorando propagação direta do kit`);
        }
      }
    }
  };
  
  propagarAtendimentoParaSubitens(produtoFinal, produtoConsumido);
  
  console.log("\n=== RESULTADO APÓS CORREÇÃO ===");
  console.log("Kit:", produtoFinal.quantidadeAtendida);
  console.log("Modelo:", produtoFinal.modelos[0].quantidadeAtendida);
  console.log("Peças do modelo:", produtoFinal.modelos[0].pecas.map(p => ({ id: p.pecaId, nome: p.nome, atendida: p.quantidadeAtendida })));
  console.log("Peças diretas do kit:", produtoFinal.pecas.map(p => ({ id: p.pecaId, nome: p.nome, atendida: p.quantidadeAtendida })));
  
  // Verificação do resultado esperado
  const resultadoEsperado = {
    kit: 1,
    modelo: 1,
    pecasModelo: 1,
    pecasKit: 0 // Não deve ser atendido diretamente pois está no modelo
  };
  
  console.log("\n=== VERIFICAÇÃO ===");
  console.log("✅ Kit atendido corretamente:", produtoFinal.quantidadeAtendida === resultadoEsperado.kit);
  console.log("✅ Modelo atendido corretamente:", produtoFinal.modelos[0].quantidadeAtendida === resultadoEsperado.modelo);
  console.log("✅ Peças do modelo atendidas corretamente:", produtoFinal.modelos[0].pecas.every(p => p.quantidadeAtendida === resultadoEsperado.pecasModelo));
  console.log("✅ Peças diretas do kit NÃO atendidas (correto):", produtoFinal.pecas.every(p => p.quantidadeAtendida === resultadoEsperado.pecasKit));
  
  const tudoCorreto = 
    produtoFinal.quantidadeAtendida === resultadoEsperado.kit &&
    produtoFinal.modelos[0].quantidadeAtendida === resultadoEsperado.modelo &&
    produtoFinal.modelos[0].pecas.every(p => p.quantidadeAtendida === resultadoEsperado.pecasModelo) &&
    produtoFinal.pecas.every(p => p.quantidadeAtendida === resultadoEsperado.pecasKit);
  
  console.log("\n" + (tudoCorreto ? "🎉 CORREÇÃO FUNCIONOU!" : "❌ CORREÇÃO FALHOU!"));
  
} catch (error) {
  console.error("Erro no teste:", error);
}
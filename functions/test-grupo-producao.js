// Teste para verificar lógica de aplicação de modificações em grupos de produção

const grupoMock = {
  id: "MT0zIB1Awn7KrGREdlVf",
  status: "aguardando",
  quantidadeProduzirGrupo: 15,
  totalPartsQuantity: 15,
  quantidadeOriginalGrupo: 8,
  partesNoGrupo: {
    "LjKvrYGEMBttWAM5wi6p": {
      quantidade: 15,
      nome: "Simples",
      pecaTipoDetalhado: "simples",
      hasAssembly: false
    }
  },
  pedidosOrigem: [
    {
      pedidoId: "MdYpsY0YBF0zssCbMZUK",
      pedidoNumero: "1",
      assemblyInstances: [
        "MdYpsY0YBF0zssCbMZUK-lab8UHknYyzgUYlbhxxF-1-63I1fKBSglotHXh1ndqq-1",
        "MdYpsY0YBF0zssCbMZUK-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-63I1fKBSglotHXh1ndqq-1"
      ],
      quantidadeRequerida: 1,
      targetProductId: "63I1fKBSglotHXh1ndqq",
      targetProductType: "peca"
    }
  ]
};

const modificacoesMock = {
  "partesNoGrupo.LjKvrYGEMBttWAM5wi6p.quantidade": -1
};

// Simular lógica de aplicação de modificações
function aplicarModificacoes(grupo, modificacoes) {
  const updatedGrupo = { ...grupo };
  const updatedPartesNoGrupo = { ...grupo.partesNoGrupo };
  let totalPartsQuantity = 0;
  let todasPartesAtendidas = true;
  
  console.log("=== TESTE DE APLICAÇÃO DE MODIFICAÇÕES ===");
  console.log("Grupo antes:", {
    status: grupo.status,
    quantidadeProduzirGrupo: grupo.quantidadeProduzirGrupo,
    totalPartsQuantity: grupo.totalPartsQuantity,
    partesNoGrupo: grupo.partesNoGrupo
  });
  
  for (const [campoPath, valor] of Object.entries(modificacoes)) {
    console.log(`\nProcessando: ${campoPath} = ${valor}`);
    
    if (campoPath.startsWith('partesNoGrupo.')) {
      const parteId = campoPath.replace('partesNoGrupo.', '').split('.')[0];
      console.log(`Parte ID: ${parteId}`);
      
      if (updatedPartesNoGrupo[parteId]) {
        const quantidadeAtual = updatedPartesNoGrupo[parteId].quantidade;
        const novaQuantidade = Math.max(0, quantidadeAtual + valor);
        
        console.log(`Quantidade: ${quantidadeAtual} + ${valor} = ${novaQuantidade}`);
        
        updatedPartesNoGrupo[parteId] = {
          ...updatedPartesNoGrupo[parteId],
          quantidade: novaQuantidade
        };
        
        if (novaQuantidade > 0) {
          todasPartesAtendidas = false;
          console.log(`Parte ainda tem quantidade > 0`);
        } else {
          console.log(`Parte completamente atendida (quantidade = 0)`);
        }
      }
    }
  }
  
  // Calcular nova quantidade total
  totalPartsQuantity = Object.values(updatedPartesNoGrupo).reduce(
    (sum, parte) => sum + parte.quantidade, 0
  );
  
  console.log(`\nNova totalPartsQuantity: ${totalPartsQuantity}`);
  console.log(`todasPartesAtendidas: ${todasPartesAtendidas}`);
  
  updatedGrupo.partesNoGrupo = updatedPartesNoGrupo;
  updatedGrupo.quantidadeProduzirGrupo = totalPartsQuantity;
  updatedGrupo.totalPartsQuantity = totalPartsQuantity;
  
  // Lógica de status
  if (todasPartesAtendidas) {
    updatedGrupo.status = 'atendido_por_estoque';
    console.log(`Status: atendido_por_estoque (completamente atendido)`);
  } else if (totalPartsQuantity < grupo.quantidadeOriginalGrupo) {
    updatedGrupo.status = 'em_producao';
    console.log(`Status: em_producao (${totalPartsQuantity} < ${grupo.quantidadeOriginalGrupo})`);
  } else if (totalPartsQuantity === grupo.quantidadeOriginalGrupo && grupo.status === 'aguardando') {
    updatedGrupo.status = 'aguardando';
    console.log(`Status: aguardando (nada mudou)`);
  } else {
    updatedGrupo.status = grupo.status;
    console.log(`Status: mantém ${grupo.status}`);
  }
  
  console.log("\nGrupo após:", {
    status: updatedGrupo.status,
    quantidadeProduzirGrupo: updatedGrupo.quantidadeProduzirGrupo,
    totalPartsQuantity: updatedGrupo.totalPartsQuantity,
    partesNoGrupo: updatedGrupo.partesNoGrupo
  });
  
  return updatedGrupo;
}

// Executar teste
console.log("=== TESTE 1: Debitar 1 unidade ===");
const resultado1 = aplicarModificacoes(grupoMock, modificacoesMock);

console.log("\n\n=== TESTE 2: Debitar mais 14 unidades (deixar 0) ===");
const modificacoesCompletas = {
  "partesNoGrupo.LjKvrYGEMBttWAM5wi6p.quantidade": -14
};
const resultado2 = aplicarModificacoes(resultado1, modificacoesCompletas);

console.log("\n\n=== RESUMO ===");
console.log("Teste 1 - Debitar 1:");
console.log(`- Quantidade anterior: 15`);
console.log(`- Quantidade após: ${resultado1.partesNoGrupo["LjKvrYGEMBttWAM5wi6p"].quantidade}`);
console.log(`- Status: ${resultado1.status}`);

console.log("\nTeste 2 - Debitar 14 (deixar 0):");
console.log(`- Quantidade anterior: ${resultado1.partesNoGrupo["LjKvrYGEMBttWAM5wi6p"].quantidade}`);
console.log(`- Quantidade após: ${resultado2.partesNoGrupo["LjKvrYGEMBttWAM5wi6p"].quantidade}`);
console.log(`- Status: ${resultado2.status}`);

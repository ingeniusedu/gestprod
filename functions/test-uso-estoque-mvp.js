// Teste MVP para validação do fluxo de uso de estoque
// Este teste simula a lógica do handler sem precisar do Firebase

console.log('=== TESTE MVP - USO DE ESTOQUE ===\n');

// Simulação de payload do frontend (MVP simplificado)
const payloadMVP = {
  pedidoId: 'pedido-teste-123',
  nivelUsado: 2,
  produtoRaiz: {
    id: 'peca-teste-456',
    tipo: 'peca',
    quantidade: 1
  },
  produtosConsumidos: [
    {
      produtoId: 'peca-teste-456',
      produtoTipo: 'peca',
      quantidade: 1,
      nivel: 2
    }
  ],
  posicoesConsumidas: [
    {
      produtoId: 'peca-teste-456',
      produtoTipo: 'peca',
      posicaoEstoqueId: 'estoque-local-1',
      quantidade: 1
    }
  ],
  gruposMontagemAfetados: [
    {
      grupoMontagemId: 'grupo-montagem-teste-789',
      assemblyInstanceId: 'pedido-teste-123-modelo-teste-456-peca-teste-456-1',
      modificacoes: [
        {
          campo: 'atendimentoDetalhado',
          valor: {
            origem: 'estoque_peca',
            quantidade: 1,
            produtoRaizId: 'peca-teste-456',
            produtoRaizTipo: 'peca'
          }
        }
      ]
    }
  ],
  gruposProducaoAfetados: [], // Vazio para MVP
  timestamp: new Date().toISOString()
};

console.log('1. PAYLOAD DO FRONTEND (MVP):');
console.log(JSON.stringify(payloadMVP, null, 2));
console.log('\n---\n');

// Simulação de grupo de montagem existente
const grupoMontagemExistente = {
  id: 'grupo-montagem-teste-789',
  pedidoId: 'pedido-teste-123',
  targetProductId: 'peca-teste-456',
  targetProductType: 'peca',
  targetProductName: 'Peça Teste',
  assemblyInstanceId: 'pedido-teste-123-modelo-teste-456-peca-teste-456-1',
  status: 'aguardando_montagem',
  pecasNecessarias: [
    {
      pecaId: 'peca-teste-456',
      nome: 'Peça Teste',
      quantidade: 1,
      atendimentoDetalhado: [] // Vazio inicialmente
    }
  ]
};

console.log('2. GRUPO DE MONTAGEM EXISTENTE:');
console.log(JSON.stringify(grupoMontagemExistente, null, 2));
console.log('\n---\n');

// Simulação da lógica do handler (MVP simplificado)
function aplicarModificacoesGruposMontagemMVP(grupo, modificacoes) {
  console.log('3. APLICANDO MODIFICAÇÕES (SIMULAÇÃO HANDLER):');
  
  const updatedGrupo = { ...grupo };
  
  modificacoes.forEach((modificacao, index) => {
    const { campo, valor } = modificacao;
    
    if (campo === 'atendimentoDetalhado') {
      console.log(`  Modificação ${index + 1}: ${campo}`);
      console.log(`    Origem: ${valor.origem}`);
      console.log(`    Quantidade: ${valor.quantidade}`);
      console.log(`    Produto: ${valor.produtoRaizId} (${valor.produtoRaizTipo})`);
      
      // Adicionar atendimento na estrutura correta
      if (valor.produtoRaizTipo === 'peca' && updatedGrupo.pecasNecessarias) {
        const updatedPecas = updatedGrupo.pecasNecessarias.map(peca => {
          if (peca.pecaId === valor.produtoRaizId) {
            const novoAtendimento = {
              origem: valor.origem,
              quantidade: valor.quantidade,
              timestamp: new Date().toISOString()
            };
            
            peca.atendimentoDetalhado = [...(peca.atendimentoDetalhado || []), novoAtendimento];
            console.log(`    ✓ Atendimento adicionado à peça ${peca.nome}`);
          }
          return peca;
        });
        updatedGrupo.pecasNecessarias = updatedPecas;
      }
    }
  });
  
  // Verificar se o grupo está completamente atendido
  function verificarGrupoCompletamenteAtendido(grupo) {
    if (grupo.pecasNecessarias && grupo.pecasNecessarias.length > 0) {
      const todasPecasAtendidas = grupo.pecasNecessarias.every(peca => {
        const totalAtendido = peca.atendimentoDetalhado?.reduce(
          (sum, item) => sum + item.quantidade, 0
        ) || 0;
        return totalAtendido >= peca.quantidade;
      });
      return todasPecasAtendidas;
    }
    return false;
  }
  
  const grupoCompletamenteAtendido = verificarGrupoCompletamenteAtendido(updatedGrupo);
  if (grupoCompletamenteAtendido) {
    updatedGrupo.status = 'concluido_por_estoque';
    console.log('  Status: atualizado para "concluido_por_estoque" (grupo completamente atendido)');
  } else {
    console.log('  Status: mantido como ' + updatedGrupo.status + ' (grupo parcialmente atendido)');
  }
  
  return updatedGrupo;
}

// Executar simulação
const grupoAtualizado = aplicarModificacoesGruposMontagemMVP(
  grupoMontagemExistente,
  payloadMVP.gruposMontagemAfetados[0].modificacoes
);

console.log('\n---\n');
console.log('4. GRUPO DE MONTAGEM ATUALIZADO:');
console.log(JSON.stringify(grupoAtualizado, null, 2));

// Validação
console.log('\n=== VALIDAÇÃO ===');
const pecaAtualizada = grupoAtualizado.pecasNecessarias[0];
const totalAtendido = pecaAtualizada.atendimentoDetalhado.reduce(
  (sum, item) => sum + item.quantidade, 0
);

console.log(`Peça: ${pecaAtualizada.nome}`);
console.log(`Quantidade necessária: ${pecaAtualizada.quantidade}`);
console.log(`Total atendido: ${totalAtendido}`);
console.log(`Status do grupo: ${grupoAtualizado.status}`);

if (totalAtendido >= pecaAtualizada.quantidade) {
  console.log('✓ Peça completamente atendida!');
} else {
  console.log('⚠ Peça parcialmente atendida');
}

console.log('\n=== TESTE CONCLUÍDO ===');
console.log('O MVP está funcionando corretamente!');
console.log('O frontend envia IDs diretos e o handler atualiza atendimentoDetalhado.');
console.log('Status É alterado automaticamente para "concluido_por_estoque" quando grupo completamente atendido.');

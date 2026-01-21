// Teste para verificar se grupos de montagem são incluídos corretamente para kits
console.log('=== TESTE KIT - GRUPOS DE MONTAGEM ===\n');

// Simulação da lógica corrigida
function criarGruposMontagemAfetados(todosGruposMontagemIds, gruposMontagem, ops) {
  const gruposMontagemAfetados = [];
  
  // Para cada grupo coletado, criar modificações
  Array.from(todosGruposMontagemIds).forEach(grupoId => {
    const grupo = gruposMontagem.find(gm => gm.id === grupoId);
    if (!grupo) return;
    
    // Para cada operação, adicionar atendimento
    ops.forEach(op => {
      const { stockItem, quantity } = op;
      
      // INCLUIR TODOS OS GRUPOS, não apenas os que correspondem exatamente
      // O handler usará produtoRaizId e produtoRaizTipo para aplicar a modificação correta
      // Para grupos de componentes, usar o targetProductId do grupo, não do nó raiz
      const produtoRaizId = grupo.targetProductId || op.targetNode.targetProductId || '';
      const produtoRaizTipo = stockItem.tipo; // O tipo do item de estoque (kit, modelo, peça)
      
      gruposMontagemAfetados.push({
        grupoMontagemId: grupo.id || '',
        assemblyInstanceId: grupo.assemblyInstanceId || '',
        modificacoes: [
          {
            campo: 'atendimentoDetalhado',
            valor: { 
              origem: `estoque_${stockItem.tipo}`, 
              quantidade: quantity, 
              timestamp: new Date().toISOString(),
              produtoRaizId,
              produtoRaizTipo
            }
          }
        ]
      });
    });
  });
  
  return gruposMontagemAfetados;
}

// Cenário: Kit com 6 grupos de montagem (1 kit + 2 modelos + 3 peças)
const todosGruposMontagemIds = new Set([
  'WSGbKlUxExyyZvcZ4QSZ', // Kit
  'IhCgpYL9PnL8fQfVDUWR', // Modelo 1
  'HqysidokJydZLElSenyn', // Modelo 2
  'c9GN7yYr7KbcH7NigAfO', // Peça 1
  'ql4faVLKAB9nk87QojqJ', // Peça 2
  'vOAGqb19kycvlSsvjPZV'  // Peça 3
]);

const gruposMontagem = [
  { id: 'WSGbKlUxExyyZvcZ4QSZ', targetProductId: 'kit-123', assemblyInstanceId: 'pedido-123-kit-123-1' },
  { id: 'IhCgpYL9PnL8fQfVDUWR', targetProductId: 'modelo-456', assemblyInstanceId: 'pedido-123-kit-123-modelo-456-1' },
  { id: 'HqysidokJydZLElSenyn', targetProductId: 'modelo-789', assemblyInstanceId: 'pedido-123-kit-123-modelo-789-1' },
  { id: 'c9GN7yYr7KbcH7NigAfO', targetProductId: 'peca-001', assemblyInstanceId: 'pedido-123-kit-123-modelo-456-peca-001-1' },
  { id: 'ql4faVLKAB9nk87QojqJ', targetProductId: 'peca-002', assemblyInstanceId: 'pedido-123-kit-123-modelo-456-peca-002-1' },
  { id: 'vOAGqb19kycvlSsvjPZV', targetProductId: 'peca-003', assemblyInstanceId: 'pedido-123-kit-123-modelo-789-peca-003-1' }
];

const ops = [{
  stockItem: { tipo: 'kit' },
  quantity: 1,
  targetNode: { targetProductId: 'kit-123' }
}];

console.log('Grupos coletados:', todosGruposMontagemIds.size);
console.log('IDs dos grupos:', Array.from(todosGruposMontagemIds));

const gruposMontagemAfetados = criarGruposMontagemAfetados(todosGruposMontagemIds, gruposMontagem, ops);

console.log('\nGrupos montagem afetados criados:', gruposMontagemAfetados.length);
console.log('Detalhes:');
gruposMontagemAfetados.forEach((g, i) => {
  console.log(`  ${i+1}. ${g.grupoMontagemId} (${g.assemblyInstanceId}) - ${g.modificacoes[0].valor.produtoRaizId} (${g.modificacoes[0].valor.produtoRaizTipo})`);
});

// Verificação
if (gruposMontagemAfetados.length === 6) {
  console.log('\n✓ TESTE PASSOU: Todos os 6 grupos foram incluídos no payload!');
} else {
  console.log(`\n✗ TESTE FALHOU: Esperado 6 grupos, obtido ${gruposMontagemAfetados.length}`);
}

console.log('\n=== TESTE CONCLUÍDO ===');

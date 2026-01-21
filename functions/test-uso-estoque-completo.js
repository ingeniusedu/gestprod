const admin = require('firebase-admin');

// Inicializar Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testUsoEstoqueCompleto() {
  console.log('=== TESTE COMPLETO DE USO DE ESTOQUE COM EVENTOS DOWNSTREAM ===');
  
  // Limpar dados de teste anteriores
  console.log('Limpando dados de teste anteriores...');
  const batch = db.batch();
  
  const collections = ['pedidos', 'gruposProducaoOtimizados', 'gruposMontagem', 'lancamentosProducao'];
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName)
      .where('id', 'in', ['test-pedido-002', 'test-grupo-002', 'test-grupo-montagem-002', 'test-lancamento-002'])
      .get();
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
  }
  
  await batch.commit();
  console.log('✅ Dados anteriores limpos');
  
  // 1. Criar um pedido de teste com modelo e peça
  const pedidoRef = db.collection('pedidos').doc('test-pedido-002');
  await pedidoRef.set({
    id: 'test-pedido-002',
    numero: 'TEST-002',
    status: 'em_producao',
    produtos: [
      {
        produtoId: 'test-modelo-001',
        tipo: 'modelo',
        skuProduto: 'MODELO-TEST-001',
        nomeProduto: 'Modelo de Teste',
        quantidade: 2,
        pecasComponentes: [
          {
            id: 'test-peca-001',
            nome: 'Peça de Teste',
            tipo: 'peca',
            quantidade: 4 // 2 modelos × 2 peças cada
          }
        ]
      }
    ]
  });

  // 2. Criar um grupo de montagem para o modelo
  const grupoMontagemRef = db.collection('gruposMontagem').doc('test-grupo-montagem-002');
  await grupoMontagemRef.set({
    id: 'test-grupo-montagem-002',
    pedidoId: 'test-pedido-002',
    pedidoNumero: 'TEST-002',
    targetProductId: 'test-modelo-001',
    targetProductType: 'modelo',
    targetProductName: 'Modelo de Teste',
    assemblyInstanceId: 'test-instance-modelo-001',
    status: 'aguardando_montagem',
    pecasNecessarias: [
      {
        pecaId: 'test-peca-001',
        nome: 'Peça de Teste',
        quantidade: 4,
        atendimentoDetalhado: []
      }
    ]
  });

  // 3. Criar um lançamento de uso de estoque para a peça
  const lancamentoRef = db.collection('lancamentosProducao').doc('test-lancamento-002');
  const lancamento = {
    id: 'test-lancamento-002',
    tipoEvento: 'uso_estoque',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    usuarioId: 'test-user',
    status: 'pendente',
    payload: {
      pedidoId: 'test-pedido-002',
      nivelUsado: 1, // Nível da peça (filha do modelo)
      produtoRaiz: {
        id: 'test-peca-001',
        tipo: 'peca',
        quantidade: 4,
        parentModeloId: 'test-modelo-001',
        assemblyInstanceId: 'test-instance-modelo-001'
      },
      produtosConsumidos: [
        {
          produtoId: 'test-peca-001',
          produtoTipo: 'peca',
          quantidade: 4,
          nivel: 1,
          parentModeloId: 'test-modelo-001',
          assemblyInstanceId: 'test-instance-modelo-001'
        }
      ],
      posicoesConsumidas: [
        {
          produtoId: 'test-peca-001',
          produtoTipo: 'peca',
          posicaoEstoqueId: 'test-recipiente-002',
          quantidade: 4
        }
      ]
    }
  };

  await lancamentoRef.set(lancamento);

  console.log('✅ Dados de teste criados:');
  console.log('- Pedido: test-pedido-002 (com modelo e peça)');
  console.log('- Grupo de montagem: test-grupo-montagem-002');
  console.log('- Lançamento: test-lancamento-002');
  console.log('');
  console.log('Este teste simula o uso de estoque de uma peça que pertence a um modelo.');
  console.log('O que deve acontecer após a execução do handler:');
  console.log('');
  console.log('1. O grupo de montagem deve ser atualizado:');
  console.log('   - A peça deve ter atendimento detalhado registrado');
  console.log('   - O status deve mudar para "pronto_para_montagem" se todas as peças foram atendidas');
  console.log('');
  console.log('2. Um evento downstream deve ser criado:');
  console.log('   - Tipo: ENTRADA_PECA_MONTAGEM_MODELO');
  console.log('   - AssemblyInstanceId: test-instance-modelo-001');
  console.log('   - PeçaId: test-peca-001');
  console.log('   - Quantidade: 4');
  console.log('   - ParentModeloId: test-modelo-001');
  console.log('');
  console.log('3. O lançamento original deve ser marcado como "processado"');
  console.log('');
  console.log('Para executar manualmente (se o trigger não estiver configurado):');
  console.log('1. Importe e execute a função handleUsoEstoque');
  console.log('2. Passe o snapshot do documento test-lancamento-002');
  console.log('');
  console.log('Para verificar os resultados:');
  console.log('1. Verifique o grupo de montagem:');
  console.log('   db.collection("gruposMontagem").doc("test-grupo-montagem-002").get()');
  console.log('');
  console.log('2. Verifique se novos lançamentos foram criados:');
  console.log('   db.collection("lancamentosProducao")');
  console.log('     .where("tipoEvento", "==", "entrada_peca_montagem_modelo")');
  console.log('     .get()');
}

testUsoEstoqueCompleto().catch(console.error);

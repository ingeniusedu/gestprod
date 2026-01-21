const admin = require('firebase-admin');

// Inicializar Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testUsoEstoque() {
  console.log('=== TESTE DE USO DE ESTOQUE ===');
  
  // 1. Criar um pedido de teste
  const pedidoRef = db.collection('pedidos').doc('test-pedido-001');
  await pedidoRef.set({
    numero: 'TEST-001',
    status: 'em_producao',
    produtos: [
      {
        produtoId: 'test-parte-001',
        tipo: 'parte',
        skuProduto: 'PARTE-TEST-001',
        nomeProduto: 'Parte de Teste',
        quantidade: 10,
        gruposImpressaoProducao: [
          {
            id: 'test-grupo-001',
            status: 'aguardando',
            quantidade: 10
          }
        ]
      }
    ]
  });

  // 2. Criar um grupo de produção otimizado
  const grupoRef = db.collection('gruposProducaoOtimizados').doc('test-grupo-001');
  await grupoRef.set({
    id: 'test-grupo-001',
    sourceName: 'Grupo de Teste',
    status: 'aguardando',
    pedidosOrigem: [
      {
        pedidoId: 'test-pedido-001',
        pedidoNumero: 'TEST-001',
        groupId: 'test-grupo-001'
      }
    ],
    partesNoGrupo: {
      'test-parte-001': {
        nome: 'Parte de Teste',
        quantidade: 10,
        sku: 'PARTE-TEST-001'
      }
    },
    totalPartsQuantity: 10
  });

  // 3. Criar um lançamento de uso de estoque
  const lancamentoRef = db.collection('lancamentosProducao').doc('test-lancamento-001');
  const lancamento = {
    tipoEvento: 'uso_estoque',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    usuarioId: 'test-user',
    status: 'pendente',
    payload: {
      pedidoId: 'test-pedido-001',
      nivelUsado: 0,
      produtoRaiz: {
        id: 'test-parte-001',
        tipo: 'parte',
        quantidade: 5
      },
      produtosConsumidos: [
        {
          produtoId: 'test-parte-001',
          produtoTipo: 'parte',
          quantidade: 5,
          nivel: 0
        }
      ],
      posicoesConsumidas: [
        {
          produtoId: 'test-parte-001',
          produtoTipo: 'parte',
          posicaoEstoqueId: 'test-recipiente-001',
          quantidade: 5
        }
      ]
    }
  };

  await lancamentoRef.set(lancamento);

  console.log('✅ Dados de teste criados:');
  console.log('- Pedido: test-pedido-001');
  console.log('- Grupo de produção: test-grupo-001');
  console.log('- Lançamento: test-lancamento-001');
  console.log('');
  console.log('Agora execute a função processLancamentoProducao manualmente ou aguarde o trigger.');
  console.log('');
  console.log('Para verificar o resultado:');
  console.log('1. Verifique se o grupo de produção foi atualizado para status "em_producao"');
  console.log('2. Verifique se a quantidade da parte no grupo foi reduzida de 10 para 5');
  console.log('3. Verifique se o atendimento detalhado foi registrado corretamente');
}

testUsoEstoque().catch(console.error);

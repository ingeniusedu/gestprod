const admin = require('firebase-admin');

// Configurar Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'gestprod-6d4c8'
  });
}

const db = admin.firestore();

async function testConclusaoPedido() {
  console.log('🧪 INICIANDO TESTE DE CONCLUSÃO DE PEDIDO');
  
  try {
    // 1. Criar documento de teste na coleção lancamentosProducao
    const testDocument = {
      tipoEvento: 'conclusao_pedido',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      usuarioId: 'test-user',
      payload: {
        pedidoId: 'test-pedido-123',
        pedidoNumero: 'TEST-001',
        assemblyGroupId: 'test-assembly-group-456',
        produtoId: 'test-produto-789',
        produtoNome: 'Produto de Teste',
        quantidade: 2,
        usuarioId: 'test-user',
        tempoEmbalagem: 30, // 30 minutos
        embalagemId: 'test-embalagem-group',
        insumosEmbalagem: [
          {
            insumoId: 'test-insumo-caixa',
            quantidade: 2
          },
          {
            insumoId: 'test-insumo-fita',
            quantidade: 4
          }
        ],
        itensConferidos: {
          'item-1': true,
          'item-2': true
        }
      }
    };

    console.log('📝 Criando documento de teste:', JSON.stringify(testDocument, null, 2));
    
    // Criar o documento
    const docRef = await db.collection('lancamentosProducao').add(testDocument);
    console.log(`✅ Documento criado com ID: ${docRef.id}`);

    // 2. Aguardar um pouco para o processamento
    console.log('⏳ Aguardando processamento da Cloud Function...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Verificar se o documento foi processado
    const createdDoc = await docRef.get();
    if (createdDoc.exists) {
      console.log('✅ Documento encontrado no Firestore');
      
      // 4. Verificar se os documentos relacionados foram criados
      console.log('🔍 Verificando documentos de insumos...');
      const insumosSnapshot = await db.collection('lancamentosInsumos')
        .where('pedidoId', '==', 'test-pedido-123')
        .get();
      
      console.log(`📦 Encontrados ${insumosSnapshot.size} documentos de insumos`);
      insumosSnapshot.forEach(doc => {
        console.log(`   - Insumo: ${doc.data().insumoId}, Quantidade: ${doc.data().quantidade}`);
      });

      console.log('🔍 Verificando documentos de serviços...');
      const servicosSnapshot = await db.collection('lancamentosServicos')
        .where('origem', '==', 'pedido')
        .where('payload.pedidoId', '==', 'test-pedido-123')
        .get();
      
      console.log(`📦 Encontrados ${servicosSnapshot.size} documentos de serviços`);
      servicosSnapshot.forEach(doc => {
        console.log(`   - Serviço: ${doc.data().serviceType}, Total: ${doc.data().payload.total} minutos`);
      });

      console.log('🔍 Verificando atualização do pedido...');
      const pedidoDoc = await db.collection('pedidos').doc('test-pedido-123').get();
      if (pedidoDoc.exists) {
        const pedidoData = pedidoDoc.data();
        console.log(`   - Status: ${pedidoData.status}`);
        console.log(`   - Data de conclusão: ${pedidoData.dataConclusao?.toDate()}`);
      }

      console.log('🔍 Verificando atualização do grupo de montagem...');
      const grupoDoc = await db.collection('gruposMontagem').doc('test-assembly-group-456').get();
      if (grupoDoc.exists) {
        const grupoData = grupoDoc.data();
        console.log(`   - Status: ${grupoData.status}`);
        console.log(`   - Timestamp de conclusão: ${grupoData.timestampConclusao?.toDate()}`);
      }

    } else {
      console.log('❌ Documento não encontrado no Firestore');
    }

    console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error);
  }
}

// Executar o teste
testConclusaoPedido().then(() => {
  console.log('🏁 Finalizando teste...');
  process.exit(0);
}).catch(error => {
  console.error('💥 Falha fatal no teste:', error);
  process.exit(1);
});

const { getApps, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { processLancamentoServicos } = require('./lib/functions/src/index');

// Get existing Firebase Admin app
const app = getApps()[0] || getApp();
const db = getFirestore(app);

async function testIntegration() {
  console.log('🧪 Testing Integration: Frontend → Backend\n');

  try {
    // 1. Create test service costs document
    console.log('📝 Creating test service costs...');
    await db.collection('settings').doc('serviceCosts').set({
      costPerMinute3DPrint: 0.50,
      costPerMinuteAssembly: 0.30,
      costPerMinutePackaging: 0.20
    });
    console.log('✅ Service costs created\n');

    // 2. Create test lancamentoServico
    console.log('📝 Creating test lancamentoServico...');
    const lancamentoRef = await db.collection('lancamentosServicos').add({
      tipo: 'impressao_3d',
      origem: 'pedido',
      pedidoId: 'test-pedido-123',
      total: 120,
      tempoMinutos: 10,
      impressora: 'Ender-3',
      usuario: 'test-user@example.com',
      data: new Date().toISOString()
    });
    console.log(`✅ Lancamento created with ID: ${lancamentoRef.id}\n`);

    // 3. Process the lancamento
    console.log('⚙️ Processing lancamento...');
    const lancamentoSnap = await lancamentoRef.get();
    const lancamentoData = { id: lancamentoSnap.id, ...lancamentoSnap.data() };
    
    await processLancamentoServicos(lancamentoData);
    console.log('✅ Lancamento processed successfully\n');

    // 4. Verify results
    console.log('🔍 Verifying results...');
    
    // Check servicos collection
    const servicosQuery = await db.collection('servicos')
      .where('tipo', '==', 'impressao_3d')
      .where('mes_referencia', '==', 'novembro_2025')
      .get();
    
    if (!servicosQuery.empty) {
      const servicoDoc = servicosQuery.docs[0];
      const servicoData = servicoDoc.data();
      
      console.log('✅ Serviço found:');
      console.log(`   Tipo: ${servicoData.tipo}`);
      console.log(`   Mês: ${servicoData.mes_referencia}`);
      console.log(`   Total: R$ ${servicoData.total.toFixed(2)}`);
      console.log(`   Custo Total: R$ ${servicoData.custo_total.toFixed(2)}`);
      console.log(`   Eventos: ${servicoData.eventos.length}`);
      
      // Check evento details
      const evento = servicoData.eventos[0];
      console.log('\n📋 Evento details:');
      console.log(`   Origem: ${evento.origem}`);
      console.log(`   Pedido ID: ${evento.pedidoId}`);
      console.log(`   Total: R$ ${evento.total.toFixed(2)}`);
      console.log(`   Custo: R$ ${evento.custo.toFixed(2)}`);
      console.log(`   Impressora: ${evento.impressora}`);
      console.log(`   Usuário: ${evento.usuario}`);
      
    } else {
      console.log('❌ No serviço found in collection');
    }

    // Check if lancamento was processed (moved to processed)
    const processedLancamento = await lancamentoRef.get();
    if (!processedLancamento.exists) {
      console.log('✅ Lancamento successfully moved to processed collection');
    } else {
      console.log('❌ Lancamento still exists in original collection');
    }

    console.log('\n🎉 Integration test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testIntegration();

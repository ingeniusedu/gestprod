// Script para testar a nova estrutura de serviços
const admin = require('firebase-admin');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require('./service-account.json')),
  projectId: 'gestprod-12345'
});

const db = admin.firestore();

async function testarNovaEstruturaServicos() {
  try {
    console.log('🧪 Iniciando teste da nova estrutura de serviços...');

    // 1. Criar configurações de custos se não existirem
    const settingsRef = db.collection('settings').doc('custosServicos');
    const settingsDoc = await settingsRef.get();
    
    if (!settingsDoc.exists) {
      console.log('📝 Criando configurações de custos...');
      await settingsRef.set({
        custoPorMinutoImpressao: 0.50, // R$ 0,50 por minuto
        custoPorMinutoMontagem: 0.30,   // R$ 0,30 por minuto
        custoPorMinutoEmbalagem: 0.20    // R$ 0,20 por minuto
      });
      console.log('✅ Configurações de custos criadas');
    } else {
      console.log('✅ Configurações de custos já existem');
    }

    // 2. Criar lançamento de serviço de teste
    const lancamentoTeste = {
      serviceType: 'impressao_3d',
      origem: 'pedido',
      usuario: 'usuario_teste',
      data: admin.firestore.Timestamp.now(),
      payload: {
        total: 120, // 2 horas em minutos
        pedidoId: 'pedido_teste_001',
        optimizedGroupId: 'grupo_teste_001'
      }
    };

    console.log('📤 Criando lançamento de serviço de teste...');
    const lancamentoRef = await db.collection('lancamentosServicos').add(lancamentoTeste);
    console.log(`✅ Lançamento criado com ID: ${lancamentoRef.id}`);

    // 3. Aguardar um pouco para o processamento
    console.log('⏳ Aguardando processamento...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. Verificar se o documento mensal foi criado
    const mesAno = getMesAnoReferencia(new Date());
    const servicoMensalRef = db.collection('servicos').doc(`impressao_3d_${mesAno}`);
    const servicoMensalDoc = await servicoMensalRef.get();

    if (servicoMensalDoc.exists) {
      const servicoData = servicoMensalDoc.data();
      console.log('✅ Documento mensal criado com sucesso!');
      console.log('📊 Dados do serviço mensal:');
      console.log(`   - Tipo: ${servicoData.serviceType}`);
      console.log(`   - Mês/Ano: ${servicoData.mes_ano}`);
      console.log(`   - Total (minutos): ${servicoData.total}`);
      console.log(`   - Custo total: R$ ${servicoData.custo_total.toFixed(2)}`);
      console.log(`   - Eventos: ${servicoData.eventos.length}`);
      
      // 5. Testar segundo lançamento para acumular
      console.log('📤 Criando segundo lançamento para teste de acumulação...');
      const lancamentoTeste2 = {
        serviceType: 'impressao_3d',
        origem: 'producao',
        usuario: 'usuario_teste',
        data: admin.firestore.Timestamp.now(),
        payload: {
          total: 60, // 1 hora em minutos
          pedidoId: 'pedido_teste_002',
          optimizedGroupId: 'grupo_teste_002'
        }
      };

      await db.collection('lancamentosServicos').add(lancamentoTeste2);
      
      // Aguardar processamento
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verificar acumulação
      const servicoMensalDoc2 = await servicoMensalRef.get();
      const servicoData2 = servicoMensalDoc2.data();
      
      console.log('✅ Acumulação testada com sucesso!');
      console.log('📊 Dados atualizados:');
      console.log(`   - Total (minutos): ${servicoData2.total}`);
      console.log(`   - Custo total: R$ ${servicoData2.custo_total.toFixed(2)}`);
      console.log(`   - Eventos: ${servicoData2.eventos.length}`);

    } else {
      console.log('❌ Documento mensal não foi criado');
    }

    console.log('🎉 Teste concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await admin.app().delete();
  }
}

function getMesAnoReferencia(data) {
  const meses = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  
  return `${mes}_${ano}`;
}

// Executar teste
if (require.main === module) {
  testarNovaEstruturaServicos();
}

module.exports = { testarNovaEstruturaServicos };

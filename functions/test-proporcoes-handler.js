// Teste da lógica de proporções baseada em assemblyInstances
console.log('=== TESTE PROPORÇÕES HANDLER ===\n');

// Simulação da função de cálculo de proporções
function calcularProporcoes(grupo, assemblyInstancesDoPayload) {
  console.log(`Calculando proporções para grupo:`);
  console.log(`- totalPartsQuantity: ${grupo.totalPartsQuantity}`);
  console.log(`- quantidadeOriginalGrupo: ${grupo.quantidadeOriginalGrupo}`);
  console.log(`- filamentosNecessarios: ${grupo.filamentosNecessarios?.[0]?.quantidade || 0}g`);
  console.log(`- tempoImpressaoGrupo: ${grupo.tempoImpressaoGrupo} minutos`);
  
  // Contar total de assemblyInstances no grupo
  let totalAssemblyInstances = 0;
  let assemblyInstancesAtendidos = assemblyInstancesDoPayload.length;
  
  if (grupo.pedidosOrigem && Array.isArray(grupo.pedidosOrigem)) {
    totalAssemblyInstances = grupo.pedidosOrigem.reduce((total, pedido) => 
      total + (pedido.assemblyInstances?.length || 0), 0
    );
  }
  
  console.log(`\nAssemblyInstances: ${assemblyInstancesAtendidos} atendidos de ${totalAssemblyInstances} totais`);
  
  // Calcular proporção atendida (baseada em assemblyInstances, não quantidade de partes)
  const proporcaoAtendida = totalAssemblyInstances > 0 ? assemblyInstancesAtendidos / totalAssemblyInstances : 0;
  const proporcaoRestante = 1 - proporcaoAtendida;
  
  console.log(`Proporção: ${proporcaoAtendida.toFixed(2)} atendida, ${proporcaoRestante.toFixed(2)} restante`);
  
  // Calcular quantidades baseadas na proporção
  const totalPartsQuantityOriginal = Math.round(grupo.totalPartsQuantity * proporcaoRestante);
  const totalPartsQuantityAtendido = Math.round(grupo.totalPartsQuantity * proporcaoAtendida);
  
  console.log(`\nQuantidades recalculadas:`);
  console.log(`- Grupo original: ${totalPartsQuantityOriginal} partes`);
  console.log(`- Grupo atendido: ${totalPartsQuantityAtendido} partes`);
  
  // Calcular filamentos baseados na proporção
  const filamentosOriginal = grupo.filamentosNecessarios?.map(f => ({
    ...f,
    quantidade: Math.round(f.quantidade * proporcaoRestante)
  })) || [];
  
  const filamentosAtendido = grupo.filamentosNecessarios?.map(f => ({
    ...f,
    quantidade: Math.round(f.quantidade * proporcaoAtendida)
  })) || [];
  
  console.log(`\nFilamentos:`);
  console.log(`- Grupo original: ${filamentosOriginal[0]?.quantidade || 0}g`);
  console.log(`- Grupo atendido: ${filamentosAtendido[0]?.quantidade || 0}g`);
  
  // Calcular tempo de impressão
  const tempoOriginal = Math.round(grupo.tempoImpressaoGrupo * proporcaoRestante);
  const tempoAtendido = Math.round(grupo.tempoImpressaoGrupo * proporcaoAtendida);
  
  console.log(`\nTempo de impressão:`);
  console.log(`- Grupo original: ${tempoOriginal} minutos`);
  console.log(`- Grupo atendido: ${tempoAtendido} minutos`);
  
  return {
    proporcaoAtendida,
    proporcaoRestante,
    totalPartsQuantityOriginal,
    totalPartsQuantityAtendido,
    filamentosOriginal,
    filamentosAtendido,
    tempoOriginal,
    tempoAtendido
  };
}

// Cenário: Grupo com 3 assemblyInstances (2 atendidos, 1 não atendido)
const grupo = {
  id: 'grupo-1756766910547',
  totalPartsQuantity: 3,
  quantidadeOriginalGrupo: 3,
  filamentosNecessarios: [
    {
      id: 'ig8lYCMnyiaDv0vgxX1h',
      grupoFilamentoId: 'ig8lYCMnyiaDv0vgxX1h',
      nome: '',
      quantidade: 60, // 60g total
      tipo: 'filamento'
    }
  ],
  tempoImpressaoGrupo: 60, // 60 minutos total
  pedidosOrigem: [
    {
      pedidoId: 'V51LJiXUkVHXcdUdomen',
      pedidoNumero: '1',
      assemblyInstances: [
        {
          assemblyInstanceId: 'V51LJiXUkVHXcdUdomen-lab8UHknYyzgUYlbhxxF-1-SzKhXq8tiCWUimE06ycE-1'
        },
        {
          assemblyInstanceId: 'V51LJiXUkVHXcdUdomen-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1'
        }
      ]
    },
    {
      pedidoId: 'LYXcncm8zRkDmo06EXcB',
      pedidoNumero: '2',
      assemblyInstances: [
        {
          assemblyInstanceId: 'LYXcncm8zRkDmo06EXcB-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1'
        }
      ]
    }
  ]
};

// Payload atende apenas o primeiro pedido (2 assemblyInstances)
const assemblyInstancesDoPayload = [
  'V51LJiXUkVHXcdUdomen-lab8UHknYyzgUYlbhxxF-1-SzKhXq8tiCWUimE06ycE-1',
  'V51LJiXUkVHXcdUdomen-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1'
];

console.log('=== CENÁRIO 1: Kit atende 2/3 do grupo ===');
console.log('Grupo original: 3 partes, 60g filamento, 60 minutos');
console.log('Payload: 2 assemblyInstances atendidos (do pedido V51LJiXUkVHXcdUdomen)\n');

const resultado = calcularProporcoes(grupo, assemblyInstancesDoPayload);

console.log('\n=== VERIFICAÇÃO ===');
console.log(`Proporção esperada: 2/3 = 0.67`);
console.log(`Proporção calculada: ${resultado.proporcaoAtendida.toFixed(2)}`);

console.log(`\nFilamentos esperados:`);
console.log(`- Grupo original: 60g × 1/3 = 20g`);
console.log(`- Grupo atendido: 60g × 2/3 = 40g`);
console.log(`Filamentos calculados:`);
console.log(`- Grupo original: ${resultado.filamentosOriginal[0]?.quantidade || 0}g`);
console.log(`- Grupo atendido: ${resultado.filamentosAtendido[0]?.quantidade || 0}g`);

console.log(`\nTempo esperado:`);
console.log(`- Grupo original: 60min × 1/3 = 20min`);
console.log(`- Grupo atendido: 60min × 2/3 = 40min`);
console.log(`Tempo calculado:`);
console.log(`- Grupo original: ${resultado.tempoOriginal}min`);
console.log(`- Grupo atendido: ${resultado.tempoAtendido}min`);

// Verificação
const filamentosCorretos = 
  resultado.filamentosOriginal[0]?.quantidade === 20 &&
  resultado.filamentosAtendido[0]?.quantidade === 40;

const tempoCorreto = 
  resultado.tempoOriginal === 20 &&
  resultado.tempoAtendido === 40;

const proporcaoCorreta = Math.abs(resultado.proporcaoAtendida - 2/3) < 0.01;

if (filamentosCorretos && tempoCorreto && proporcaoCorreta) {
  console.log('\n✓ TESTE PASSOU: Proporções calculadas corretamente!');
} else {
  console.log('\n✗ TESTE FALHOU: Proporções incorretas.');
}

// Cenário 2: Teste com grupo sem pedidosOrigem (edge case)
console.log('\n\n=== CENÁRIO 2: Grupo sem pedidosOrigem ===');
const grupoSemPedidos = {
  id: 'grupo-sem-pedidos',
  totalPartsQuantity: 5,
  quantidadeOriginalGrupo: 5,
  filamentosNecessarios: [
    {
      id: 'filamento-1',
      quantidade: 100
    }
  ],
  tempoImpressaoGrupo: 120
};

const resultado2 = calcularProporcoes(grupoSemPedidos, []);

console.log(`\nProporção esperada: 0 (sem assemblyInstances)`);
console.log(`Proporção calculada: ${resultado2.proporcaoAtendida}`);

if (resultado2.proporcaoAtendida === 0) {
  console.log('✓ TESTE PASSOU: Proporção zero para grupo sem pedidosOrigem');
} else {
  console.log('✗ TESTE FALHOU: Proporção deveria ser zero');
}

console.log('\n=== TESTE CONCLUÍDO ===');

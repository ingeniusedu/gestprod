// Teste para verificar se o frontend está filtrando corretamente os assemblyInstances

// Dados de exemplo baseados no payload real
const gruposProducaoExemplo = [
  {
    id: "9SewCvYCVWe2OthuN5IS",
    pedidosOrigem: [
      {
        pedidoId: "GIYDE50a77fTwM0jhLaa", // Pedido 1
        assemblyInstances: [
          { assemblyInstanceId: "GIYDE50a77fTwM0jhLaa-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1" }
        ]
      },
      {
        pedidoId: "9XEYGwsW7nZXjxTRtzk1", // Pedido 2
        assemblyInstances: [
          { assemblyInstanceId: "9XEYGwsW7nZXjxTRtzk1-lab8UHknYyzgUYlbhxxF-1-SzKhXq8tiCWUimE06ycE-1" },
          { assemblyInstanceId: "9XEYGwsW7nZXjxTRtzk1-lab8UHknYyzgUYlbhxxF-1-eeoEZhH6N449BiLKtwyp-1-SzKhXq8tiCWUimE06ycE-1" }
        ]
      }
    ]
  }
];

// Lógica corrigida do frontend
function coletarAssemblyInstancesCorrigido(grupo, pedidoIdAtendido) {
  const assemblyInstances = [];
  
  if (grupo.pedidosOrigem) {
    grupo.pedidosOrigem.forEach(pedidoOrigem => {
      // FILTRAR: Apenas assemblyInstances do pedido que está sendo atendido
      if (pedidoOrigem.pedidoId === pedidoIdAtendido) {
        pedidoOrigem.assemblyInstances?.forEach(instance => {
          if (instance.assemblyInstanceId && !assemblyInstances.includes(instance.assemblyInstanceId)) {
            assemblyInstances.push(instance.assemblyInstanceId);
          }
        });
      }
    });
  }
  
  return assemblyInstances;
}

// Lógica antiga (errada)
function coletarAssemblyInstancesAntigo(grupo) {
  const assemblyInstances = [];
  
  if (grupo.pedidosOrigem) {
    grupo.pedidosOrigem.forEach(pedidoOrigem => {
      pedidoOrigem.assemblyInstances?.forEach(instance => {
        if (instance.assemblyInstanceId && !assemblyInstances.includes(instance.assemblyInstanceId)) {
          assemblyInstances.push(instance.assemblyInstanceId);
        }
      });
    });
  }
  
  return assemblyInstances;
}

// Teste
console.log("=== TESTE DA CORREÇÃO DO FRONTEND ===");
console.log("\n1. Lógica ANTIGA (errada):");
const resultadoAntigo = coletarAssemblyInstancesAntigo(gruposProducaoExemplo[0]);
console.log(`   Total assemblyInstances: ${resultadoAntigo.length}`);
console.log(`   AssemblyInstances:`, resultadoAntigo);

console.log("\n2. Lógica CORRIGIDA (pedido 9XEYGwsW7nZXjxTRtzk1):");
const resultadoCorrigido = coletarAssemblyInstancesCorrigido(gruposProducaoExemplo[0], "9XEYGwsW7nZXjxTRtzk1");
console.log(`   Total assemblyInstances: ${resultadoCorrigido.length}`);
console.log(`   AssemblyInstances:`, resultadoCorrigido);

console.log("\n3. Lógica CORRIGIDA (pedido GIYDE50a77fTwM0jhLaa):");
const resultadoCorrigido2 = coletarAssemblyInstancesCorrigido(gruposProducaoExemplo[0], "GIYDE50a77fTwM0jhLaa");
console.log(`   Total assemblyInstances: ${resultadoCorrigido2.length}`);
console.log(`   AssemblyInstances:`, resultadoCorrigido2);

console.log("\n=== ANÁLISE ===");
console.log(`Lógica antiga envia: ${resultadoAntigo.length} assemblyInstances (TODOS)`);
console.log(`Lógica corrigida envia: ${resultadoCorrigido.length} assemblyInstances (apenas do pedido atendido)`);
console.log(`Diferença: ${resultadoAntigo.length - resultadoCorrigido.length} assemblyInstances a menos`);

// Verificar se a correção está certa
const esperadoParaPedido2 = 2; // Apenas os 2 assemblyInstances do pedido 2
const correto = resultadoCorrigido.length === esperadoParaPedido2;

console.log(`\nResultado: ${correto ? "✅ CORRETO" : "❌ ERRADO"}`);
console.log(`Esperado: ${esperadoParaPedido2} assemblyInstances`);
console.log(`Obtido: ${resultadoCorrigido.length} assemblyInstances`);

if (!correto) {
  console.error("\nERRO: A correção não está funcionando como esperado!");
  process.exit(1);
}

console.log("\n✅ Correção implementada com sucesso!");
console.log("O frontend agora enviará apenas os assemblyInstances do pedido atendido.");

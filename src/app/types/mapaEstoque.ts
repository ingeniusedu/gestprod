export interface LocalProduto {
  id: string;
  nome: string;
  tipo: 'gaveta' | 'prateleira' | 'armario' | 'outro';
  dimensoesGrade?: {
    x: number;
    y: number;
    z: number;
  };
  divisoes?: {
    h: number;
    v: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
  collectionType?: 'locaisProdutos';
}

export interface LocalInsumo {
  id: string;
  nome: string;
  tipo: 'gaveta' | 'prateleira' | 'armario' | 'outro';
  dimensoesGrade?: {
    x: number;
    y: number;
    z: number;
  };
  divisoes?: {
    h: number;
    v: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
  collectionType?: 'locaisInsumos';
  ocupantes?: OcupanteDivisao[];
}

export interface OcupanteDivisao {
  recipienteId: string;
  divisao: { h: number; v: number };
  insumoId: string;
  quantidade: number;
}

export interface Recipiente {
  id: string;
  nome: string; // Instance name, e.g., "Bandeja de Peças Azuis"
  modeloRecipienteId: string; // Reference to the template
  
  // The following properties are copied from the template for display purposes
  tipo: 'bandeja' | 'caixa' | 'pote' | 'outro';
  dimensoesOcupadas: {
    x: number;
    y: number;
    z: number;
  };
  divisoes?: {
    horizontais: number;
    verticais: number;
  };

  // Instance-specific properties
  localEstoqueId: string; 
  posicaoNaGrade: {
    x: number;
    y: number;
    z: number;
  };
  
  produtoAssociadoId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PosicaoEstoque {
  recipienteId?: string;
  quantidade: number;
  divisao?: { h: number; v: number } | null;
  localId?: string;
  localNome?: string;
  posicaoNaGrade?: { x: number; y: number; z: number };
}

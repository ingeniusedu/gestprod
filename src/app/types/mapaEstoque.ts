export interface LocalDeEstoque {
  id?: string;
  nome: string;
  tipo: 'gaveta' | 'prateleira' | 'armario' | 'outro';
  dimensoesGrade: {
    x: number;
    y: number;
    z: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Recipiente {
  id?: string;
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

export interface ImageMetadata {
  url: string;
  description: string;
  tags: string[];
  isUneditedPhoto?: boolean;
  isEdited?: boolean;
  isCardIG?: boolean;
  isStoriesIG?: boolean;
  hasBackgroundRemoved?: boolean;
}

export interface ProductMetadata {
  id?: string; // Firestore document ID
  productId: string; // ID of the Kit, Modelo, Peca, or Parte
  productType: 'kit' | 'modelo' | 'peca' | 'parte';
  description?: string; // Optional description for the component itself
  images?: ImageMetadata[];
}

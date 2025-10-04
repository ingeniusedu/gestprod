"use client";

import React, { useState } from 'react';
import { Plus, Trash2, UploadCloud, Sparkles } from 'lucide-react';
import { ImageMetadata, ProductMetadata } from '../types';
import { uploadImageAndGetUrl } from '../services/firebaseStorageService';
import CollapsiblePanel from './CollapsiblePanel';
import TagInput from './TagInput';

interface ImageManagerProps {
  images: ImageMetadata[];
  onImagesChange: (images: ImageMetadata[]) => void;
  componentId: string;
  componentDescription: string;
}

const GENERATE_METADATA_FUNCTION_URL = "/api/gemini/generateImageMetadata";

const ImageManager: React.FC<ImageManagerProps> = ({ images, onImagesChange, componentId, componentDescription }) => {
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageDescription, setNewImageDescription] = useState('');
  const [newImageTags, setNewImageTags] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadError(null);
    try {
      const url = await uploadImageAndGetUrl(file);
      setNewImageUrl(url);
    } catch (err) {
      console.error("Error uploading image:", err);
      setUploadError("Falha ao fazer upload da imagem.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddImage = () => {
    if (newImageUrl.trim()) {
      const newImage: ImageMetadata = {
        url: newImageUrl.trim(),
        description: newImageDescription.trim(),
        tags: newImageTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
      };
      onImagesChange([...images, newImage]);
      setNewImageUrl('');
      setNewImageDescription('');
      setNewImageTags('');
    }
  };

  const handleRemoveImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  const handleImageDescriptionChange = (index: number, value: string) => {
    const updatedImages = [...images];
    if (updatedImages[index]) {
      updatedImages[index].description = value;
    }
    onImagesChange(updatedImages);
  };

  const handleImageTagsChange = (index: number, value: string) => {
    const updatedImages = [...images];
    if (updatedImages[index]) {
      updatedImages[index].tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }
    onImagesChange(updatedImages);
  };

  const handleGenerateImageMetadataWithAI = async (imageUrl: string, imageIndex?: number) => {
    if (!imageUrl.trim()) {
      setAiError("URL da imagem é necessária para gerar metadados com IA.");
      return;
    }

    setGeneratingAI(true);
    setAiError(null);
    try {
      const response = await fetch(GENERATE_METADATA_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl, componentDescription }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha na requisição da IA.');
      }

      const { data } = await response.json();
      const { description, tags } = data;

      if (imageIndex !== undefined) {
        const updatedImages = [...images];
        if (updatedImages[imageIndex]) {
          updatedImages[imageIndex].description = description;
          updatedImages[imageIndex].tags = tags;
        }
        onImagesChange(updatedImages);
      } else {
        setNewImageDescription(description);
        setNewImageTags(tags.join(', '));
      }

      setAiSuccess(true);
      setTimeout(() => setAiSuccess(false), 3000);
    } catch (error) {
      console.error("Error generating image metadata with AI:", error);
      setAiError("Falha ao gerar metadados com IA. Tente novamente.");
    } finally {
      setGeneratingAI(false);
    }
  };

  return (
    <CollapsiblePanel
      title={
        <div className="flex items-center w-full">
          <h5 className="text-md font-medium text-gray-800 mr-2">Imagens:</h5>
          <div className="flex overflow-x-auto space-x-2">
            {(images || []).slice(0, 3).map((image, idx) => (
              <img key={idx} src={image.url} alt={image.description || 'Imagem'} className="w-10 h-10 object-cover rounded-md flex-shrink-0" />
            ))}
            {images.length > 3 && <span className="text-sm text-gray-500 ml-2">+{images.length - 3} mais</span>}
          </div>
        </div>
      }
      initialOpen={true}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2"> {/* Reduced gap and margin */}
        {(images || []).map((image, index) => (
          <div key={index} className="p-2 flex flex-col"> {/* Removed border, rounded-lg, shadow-sm */}
            <img src={image.url} alt={image.description || 'Imagem do Produto'} className="w-full h-auto object-cover mb-2 rounded-md" />
            <CollapsiblePanel
              title={<span className="font-medium text-gray-700 text-xs">Descrição da Imagem</span>}
              initialOpen={false}
            >
              <textarea
                id={`image-desc-${componentId}-${index}`}
                value={image.description}
                onChange={(e) => {
                  handleImageDescriptionChange(index, e.target.value);
                  e.target.style.height = 'auto'; // Reset height to recalculate
                  e.target.style.height = e.target.scrollHeight + 'px'; // Set height to scrollHeight
                }}
                onFocus={(e) => { // Adjust height on focus as well
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-1 text-sm"
                rows={1} // Start with 1 row, will expand with content
              />
            </CollapsiblePanel>
            <CollapsiblePanel
              title={<span className="font-medium text-gray-700 text-xs">Tags</span>}
              initialOpen={false}
            >
              <TagInput
                id={`image-tags-${componentId}-${index}`}
                tags={image.tags}
                onTagsChange={(newTags) => handleImageTagsChange(index, newTags.join(', '))}
                placeholder="Adicionar tags..."
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              title={<span className="font-medium text-gray-700 text-xs">Informações Adicionais</span>}
              initialOpen={false}
            >
              <div className="mt-2 space-y-2">
                <div className="flex items-center">
                  <input
                    id={`unedited-photo-${componentId}-${index}`}
                    type="checkbox"
                    checked={image.isUneditedPhoto || false}
                    onChange={(e) => {
                      const updatedImages = [...images];
                      if (updatedImages[index]) {
                        updatedImages[index].isUneditedPhoto = e.target.checked;
                      }
                      onImagesChange(updatedImages);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`unedited-photo-${componentId}-${index}`} className="ml-2 block text-sm text-gray-900">
                    Foto Não Editada
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id={`edited-${componentId}-${index}`}
                    type="checkbox"
                    checked={image.isEdited || false}
                    onChange={(e) => {
                      const updatedImages = [...images];
                      if (updatedImages[index]) {
                        updatedImages[index].isEdited = e.target.checked;
                      }
                      onImagesChange(updatedImages);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`edited-${componentId}-${index}`} className="ml-2 block text-sm text-gray-900">
                    Editado
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id={`card-ig-${componentId}-${index}`}
                    type="checkbox"
                    checked={image.isCardIG || false}
                    onChange={(e) => {
                      const updatedImages = [...images];
                      if (updatedImages[index]) {
                        updatedImages[index].isCardIG = e.target.checked;
                      }
                      onImagesChange(updatedImages);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`card-ig-${componentId}-${index}`} className="ml-2 block text-sm text-gray-900">
                    Card IG
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id={`stories-ig-${componentId}-${index}`}
                    type="checkbox"
                    checked={image.isStoriesIG || false}
                    onChange={(e) => {
                      const updatedImages = [...images];
                      if (updatedImages[index]) {
                        updatedImages[index].isStoriesIG = e.target.checked;
                      }
                      onImagesChange(updatedImages);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`stories-ig-${componentId}-${index}`} className="ml-2 block text-sm text-gray-900">
                    Stories IG
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id={`background-removed-${componentId}-${index}`}
                    type="checkbox"
                    checked={image.hasBackgroundRemoved || false}
                    onChange={(e) => {
                      const updatedImages = [...images];
                      if (updatedImages[index]) {
                        updatedImages[index].hasBackgroundRemoved = e.target.checked;
                      }
                      onImagesChange(updatedImages);
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`background-removed-${componentId}-${index}`} className="ml-2 block text-sm text-gray-900">
                    Fundo Removido
                  </label>
                </div>
              </div>
            </CollapsiblePanel>
            <button
              onClick={() => handleGenerateImageMetadataWithAI(image.url, index)}
              className="mt-2 inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              disabled={generatingAI || !image.url}
            >
              {generatingAI ? 'Gerando...' : <><Sparkles className="h-3 w-3 mr-1" /> Gerar com IA</>}
            </button>
            <button
              onClick={() => handleRemoveImage(index)}
              className="mt-2 inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remover Imagem
            </button>
          </div>
        ))}
      </div>

      <CollapsiblePanel title="Adicionar Nova Imagem">
        <div className=""> {/* Removed pt-4 */}
          <div className="flex items-center space-x-2 mb-2">
            <label htmlFor={`file-upload-${componentId}`} className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <UploadCloud className="h-4 w-4 mr-2" />
              {uploadingImage ? 'Carregando...' : 'Upload Imagem'}
              <input id={`file-upload-${componentId}`} name="file-upload" type="file" className="sr-only" onChange={handleImageUpload} disabled={uploadingImage} />
            </label>
            <input
              type="text"
              placeholder="URL da Imagem (ou preenchido por upload)"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={uploadingImage}
            />
          </div>
          {uploadError && <p className="text-sm text-red-600 mb-2">{uploadError}</p>}
          <input
            type="text"
            placeholder="Descrição da Imagem"
            value={newImageDescription}
            onChange={(e) => setNewImageDescription(e.target.value)}
            className="block w-full border border-gray-300 rounded-md shadow-sm p-2 mb-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          <label htmlFor={`new-image-tags-${componentId}`} className="block text-sm font-medium text-gray-700 mb-1">
            Tags:
          </label>
          <TagInput
            id={`new-image-tags-${componentId}`}
            tags={newImageTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)}
            onTagsChange={(newTags) => setNewImageTags(newTags.join(', '))}
            placeholder="Adicionar tags..."
          />
          <div className="flex space-x-2 mt-2">
            <button
              onClick={handleAddImage}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={uploadingImage || !newImageUrl.trim()}
            >
              <Plus className="h-4 w-4 mr-2" /> Adicionar Imagem
            </button>
            <button
              onClick={() => handleGenerateImageMetadataWithAI(newImageUrl.trim())}
              className="inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              disabled={generatingAI || !newImageUrl.trim()}
            >
              {generatingAI ? 'Gerando...' : <><Sparkles className="h-3 w-3 mr-1" /> Gerar com IA para Nova Imagem</>}
            </button>
          </div>
        </div>
      </CollapsiblePanel>
      {generatingAI && <p className="text-sm text-purple-600">Gerando metadados com IA...</p>}
      {aiError && <p className="text-sm text-red-600">{aiError}</p>}
      {aiSuccess && <p className="text-sm text-green-600">Metadados gerados com sucesso!</p>}
    </CollapsiblePanel>
  );
};

export default ImageManager;

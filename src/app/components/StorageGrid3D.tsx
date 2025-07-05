import React, { useRef } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Box } from '@react-three/drei';
import { LocalDeEstoque, Recipiente } from '../types/mapaEstoque';
import * as THREE from 'three';

interface StorageGrid3DProps {
  local: LocalDeEstoque;
  recipientes: Recipiente[];
  onRecipienteClick?: (recipiente: Recipiente) => void;
}

const GridBox: React.FC<{ position: [number, number, number]; size: [number, number, number]; color?: string; onClick?: () => void }> = ({ position, size, color = '#cccccc', onClick }) => {
  return (
    <mesh position={position} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
};

const RecipienteBox: React.FC<{ recipiente: Recipiente; local: LocalDeEstoque; onClick?: (recipiente: Recipiente) => void }> = ({ recipiente, local, onClick }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Ensure posicaoNaGrade exists before calculating position
  if (!recipiente.posicaoNaGrade) {
    return null; // Don't render if position is not defined
  }

  // Calculate position based on grid and receptacle dimensions, mapping to Three.js (X, Y=height, Z=depth)
  // Assuming recipiente.dimensoesOcupadas.x = width, .y = depth, .z = height
  // Assuming recipiente.posicaoNaGrade.x = grid X, .y = grid Y (depth), .z = grid Z (height)

  const threeJsX = (recipiente.posicaoNaGrade.x + recipiente.dimensoesOcupadas.x / 2) - local.dimensoesGrade.x / 2;
  const threeJsY = (recipiente.posicaoNaGrade.z + recipiente.dimensoesOcupadas.z / 2) - local.dimensoesGrade.z / 2; // Map grid Z (height) to Three.js Y (height)
  const threeJsZ = (recipiente.posicaoNaGrade.y + recipiente.dimensoesOcupadas.y / 2) - local.dimensoesGrade.y / 2; // Map grid Y (depth) to Three.js Z (depth)

  const threeJsSizeX = recipiente.dimensoesOcupadas.x;
  const threeJsSizeY = recipiente.dimensoesOcupadas.z; // Map recipient Z (height) to Three.js Y (height)
  const threeJsSizeZ = recipiente.dimensoesOcupadas.y; // Map recipient Y (depth) to Three.js Z (depth)

  console.log(`Recipiente: ${recipiente.nome}, ID: ${recipiente.id}`);
  console.log(`  Local Dims: X=${local.dimensoesGrade.x}, Y=${local.dimensoesGrade.y}, Z=${local.dimensoesGrade.z}`);
  console.log(`  Recipiente Dims (original): X=${recipiente.dimensoesOcupadas.x}, Y=${recipiente.dimensoesOcupadas.y}, Z=${recipiente.dimensoesOcupadas.z}`);
  console.log(`  Recipiente Pos na Grade (original): X=${recipiente.posicaoNaGrade.x}, Y=${recipiente.posicaoNaGrade.y}, Z=${recipiente.posicaoNaGrade.z}`);
  console.log(`  Calculated 3D Position (Three.js): X=${threeJsX}, Y=${threeJsY}, Z=${threeJsZ}`);
  console.log(`  Calculated 3D Size (Three.js): X=${threeJsSizeX}, Y=${threeJsSizeY}, Z=${threeJsSizeZ}`);

  console.log(`Recipiente: ${recipiente.nome}, ID: ${recipiente.id}`);
  console.log(`  Local Dims: X=${local.dimensoesGrade.x}, Y=${local.dimensoesGrade.y}, Z=${local.dimensoesGrade.z}`);
  console.log(`  Recipiente Dims (original): X=${recipiente.dimensoesOcupadas.x}, Y=${recipiente.dimensoesOcupadas.y}, Z=${recipiente.dimensoesOcupadas.z}`);
  console.log(`  Recipiente Pos na Grade (original): X=${recipiente.posicaoNaGrade.x}, Y=${recipiente.posicaoNaGrade.y}, Z=${recipiente.posicaoNaGrade.z}`);
  console.log(`  Calculated 3D Position (Three.js): X=${threeJsX}, Y=${threeJsY}, Z=${threeJsZ}`);
  console.log(`  Calculated 3D Size (Three.js): X=${threeJsSizeX}, Y=${threeJsSizeY}, Z=${threeJsSizeZ}`);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation(); // Prevent click from propagating to parent grid
    if (onClick) {
      onClick(recipiente);
    }
  };

  return (
    <Box
      ref={meshRef}
      args={[threeJsSizeX, threeJsSizeY, threeJsSizeZ]}
      position={[threeJsX, threeJsY, threeJsZ]}
      onClick={handleClick}
    >
      <meshStandardMaterial color="hotpink" transparent opacity={0.9} />
    </Box>
  );
};

const StorageGrid3D: React.FC<StorageGrid3DProps> = ({ local, recipientes, onRecipienteClick }) => {
  const gridColor = '#f0f0f0'; // Light grey for the grid lines

  // Calculate grid dimensions for rendering
  const gridWidth = local.dimensoesGrade.x;
  const gridHeight = local.dimensoesGrade.y;
  const gridDepth = local.dimensoesGrade.z;

  const gridLines = [];

  // X-Y planes (horizontal slices)
  for (let z = 0; z <= gridDepth; z++) {
    gridLines.push(
      <gridHelper args={[gridWidth, gridHeight, gridColor, gridColor]} position={[0, 0, z - gridDepth / 2]} rotation={[Math.PI / 2, 0, 0]} />
    );
  }

  // X-Z planes (vertical slices along Y)
  for (let y = 0; y <= gridHeight; y++) {
    gridLines.push(
      <gridHelper args={[gridWidth, gridDepth, gridColor, gridColor]} position={[0, y - gridHeight / 2, 0]} rotation={[0, 0, 0]} />
    );
  }

  // Y-Z planes (vertical slices along X)
  for (let x = 0; x <= gridWidth; x++) {
    gridLines.push(
      <gridHelper args={[gridHeight, gridDepth, gridColor, gridColor]} position={[x - gridWidth / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    );
  }

  return (
    <Canvas camera={{ position: [gridWidth * 0.8, gridHeight * 0.8, gridDepth * 5], fov: 60 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <OrbitControls />

      {/* Render grid lines */}
      {gridLines.map((line, index) => (
        <React.Fragment key={index}>{line}</React.Fragment>
      ))}

      {/* Render receptacles */}
      {recipientes
        .filter(recipiente => recipiente.localEstoqueId === local.id && recipiente.posicaoNaGrade) // Only render receptacles associated with this local and having a position
        .map(recipiente => (
          <RecipienteBox key={recipiente.id} recipiente={recipiente} local={local} onClick={onRecipienteClick} />
        ))}
    </Canvas>
  );
};

export default StorageGrid3D;

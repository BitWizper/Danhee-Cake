import { useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, ContactShadows } from '@react-three/drei';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import './CakeDesignerPage.css';

// Componente para el modelo 3D del pastel
const CakeModel = ({ spongeColor, decoration }) => {
  return (
    <group>
      {/* Piso 1 */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[1, 1, 1, 32]} />
        <meshStandardMaterial color={spongeColor} roughness={0.3} />
      </mesh>
      
      {/* Piso 2 (opcional) */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 1, 32]} />
        <meshStandardMaterial color={spongeColor} roughness={0.3} />
      </mesh>

      {/* Decoración superior */}
      <mesh position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={decoration === 'flores' ? '#ff69b4' : '#ffd700'} />
      </mesh>
    </group>
  );
};

const options = {
  sponge: [
    { id: 'vainilla', label: 'Vainilla', color: '#F5F0E8' },
    { id: 'chocolate', label: 'Chocolate', color: '#3D1F0D' },
    { id: 'redvelvet', label: 'Red Velvet', color: '#8B1A1A' },
  ],
  filling: [
    { id: 'crema', label: 'Crema batida' },
    { id: 'fresa', label: 'Fresa' },
    { id: 'ganache', label: 'Ganache' },
  ],
  decoration: [
    { id: 'flores', label: 'Flores' },
    { id: 'fondant', label: 'Fondant' },
    { id: 'oro', label: 'Pan de oro' },
  ],
  size: [
    { id: 'pequeno', label: 'Pequeño', desc: '8-10 porciones' },
    { id: 'mediano', label: 'Mediano', desc: '16-20 porciones' },
    { id: 'grande', label: 'Grande', desc: '30+ porciones' },
  ],
};

const CakeDesignerPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [design, setDesign] = useState({ sponge: 'vainilla', filling: 'crema', decoration: 'flores', size: 'mediano', tiers: 2 });

  const currentSponge = options.sponge.find(s => s.id === design.sponge);

  const handleAction = (type) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    alert(`Acción: ${type} iniciada para tu pastel personalizado.`);
  };

  return (
    <div className="designer-page" id="cake-designer-page">
      <div className="designer-page__header">
        <div className="container">
          <span className="featured__label">Experiencia 3D</span>
          <h1 className="featured__title font-serif">
            Modela tu <span className="gradient-text">obra maestra</span>
          </h1>
          <p className="featured__desc">Interactúa con el modelo 3D y personaliza cada piso</p>
        </div>
      </div>

      <div className="container designer-page__content">
        {/* Visualización 3D */}
        <div className="designer-3d-container glass" id="cake-3d-view">
          <Canvas shadows camera={{ position: [4, 4, 4], fov: 50 }}>
            <Suspense fallback={null}>
              <Stage environment="city" intensity={0.5} contactShadow={false}>
                <CakeModel spongeColor={currentSponge.color} decoration={design.decoration} />
              </Stage>
              <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={10} blur={2} far={4.5} />
            </Suspense>
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
          </Canvas>
          <div className="designer-3d-hint">Usa el mouse para rotar y hacer zoom</div>
        </div>

        {/* Opciones */}
        <div className="designer-options">
          <div className="designer-options__group">
            <h3 className="designer-options__heading">Configuración</h3>
            <div className="designer-options__grid">
              <div className="designer-opt-full">
                <label>Pisos del pastel: {design.tiers}</label>
                <input 
                  type="range" min="1" max="4" 
                  value={design.tiers} 
                  onChange={(e) => setDesign({...design, tiers: parseInt(e.target.value)})}
                />
              </div>
            </div>
          </div>

          {[
            { key: 'sponge', label: 'Bizcocho' },
            { key: 'filling', label: 'Relleno' },
            { key: 'decoration', label: 'Decoración' },
            { key: 'size', label: 'Tamaño' },
          ].map(({ key, label }) => (
            <div key={key} className="designer-options__group">
              <h3 className="designer-options__heading">{label}</h3>
              <div className="designer-options__grid">
                {options[key].map(opt => (
                  <button
                    key={opt.id}
                    className={`designer-opt ${design[key] === opt.id ? 'designer-opt--active' : ''}`}
                    onClick={() => setDesign({ ...design, [key]: opt.id })}
                  >
                    <span className="designer-opt__label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="designer-actions">
            <Button fullWidth onClick={() => handleAction('solicitud')}>
              Solicitar Diseño
            </Button>
            <Button variant="outline" fullWidth onClick={() => handleAction('cita')}>
              Agendar Cita para Degustación
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CakeDesignerPage;

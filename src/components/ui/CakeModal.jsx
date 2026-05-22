import { useState, useEffect } from 'react';
import Button from './Button';
import './CakeModal.css';

const CakeModal = ({ isOpen, onClose, onAdd, categories, initialData }) => {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    price: initialData?.price || '',
    category_id: initialData?.category_id || '',
    image: null,
    is_featured: initialData?.is_featured || false
  });
  const [preview, setPreview] = useState(initialData?.image_url || null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description || '',
        price: initialData.price,
        category_id: initialData.category_id || '',
        image: null,
        is_featured: !!initialData.is_featured
      });
      setPreview(initialData.image_url);
    } else {
      setForm({ name: '', description: '', price: '', category_id: '', image: null, is_featured: false });
      setPreview(null);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      setForm({ ...form, image: file });
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', form.name);
    formData.append('description', form.description);
    formData.append('price', form.price);
    formData.append('category_id', form.category_id);
    if (form.image) formData.append('image', form.image);
    formData.append('is_featured', form.is_featured);
    
    onAdd(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass animate-fadeUp">
        <div className="modal-header">
          <div className="modal-title-area">
            <span className="modal-subtitle">Catálogo Profesional</span>
            <h2 className="font-serif">{initialData ? 'Editar Creación' : 'Nueva Creación'}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Nombre del Pastel</label>
              <input 
                type="text" required
                className="premium-input"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Ej. Red Velvet Especial"
              />
            </div>
            <div className="form-group flex-1">
              <label>Precio base</label>
              <div className="price-input-wrapper">
                <span>$</span>
                <input 
                  type="number" required
                  className="premium-input"
                  value={form.price}
                  onChange={e => setForm({...form, price: e.target.value})}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Categoría de Evento</label>
            <select 
              className="premium-input"
              value={form.category_id}
              onChange={e => setForm({...form, category_id: e.target.value})}
              required
            >
              <option value="">Selecciona una categoría...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Imagen del Pastel</label>
            <div 
              className={`upload-zone ${dragActive ? 'upload-zone--active' : ''} ${preview ? 'upload-zone--has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {preview ? (
                <div className="upload-preview">
                  <img src={preview} alt="Vista previa" />
                  <div className="upload-overlay">
                    <span>Click o arrastra para cambiar</span>
                  </div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📸</span>
                  <p>Arrastra tu foto aquí o haz clic para buscar</p>
                  <span className="upload-hint">JPG, PNG (Máx 5MB)</span>
                </div>
              )}
              <input 
                type="file" 
                className="file-input-hidden"
                accept="image/*" 
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Descripción y Detalles</label>
            <textarea 
              className="premium-input"
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Habla sobre los sabores, texturas y personalización..."
            />
          </div>

          <div className="modal-footer">
            <div className="form-check">
              <input 
                type="checkbox" id="is_featured"
                checked={form.is_featured}
                onChange={e => setForm({...form, is_featured: e.target.checked})}
              />
              <label htmlFor="is_featured">Destacar en portafolio</label>
            </div>
            
            <div className="modal-actions">
              <button type="button" className="btn-text" onClick={onClose}>Cancelar</button>
              <Button type="submit" variant="gold">
                {initialData ? 'Guardar Cambios' : 'Publicar Pastel'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CakeModal;

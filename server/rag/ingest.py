from pathlib import Path

from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings

base_dir = Path(__file__).resolve().parent

loader = PyPDFDirectoryLoader(str(base_dir / "data"))
documents = loader.load()

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50
)

docs = text_splitter.split_documents(documents)

db = Chroma.from_documents(
    docs,
    OllamaEmbeddings(model="nomic-embed-text"),
    persist_directory=str(base_dir / "chroma")
)

print("Base vectorial creada correctamente")
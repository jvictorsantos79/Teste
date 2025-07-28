# Ferramenta de Controle de Comparecimento

Este projeto fornece uma pequena aplicação web que extrai dados de arquivos de imagem e PDF contendo listas de eleitores. Os dados são convertidos para uma tabela com as colunas **CNF**, **Nome**, **Comparecimento**, **Local** e **Urna**. Também é possível pesquisar por nome ou CNF.

## Como usar

1. Instale as dependências (é necessário ter o `tesseract` instalado no sistema):

```bash
pip install -r requirements.txt
```

2. Execute a aplicação:

```bash
python app.py
```

3. Acesse `http://localhost:5000` no navegador. Utilize o formulário para enviar arquivos PDF ou imagens contendo a tabela de eleitores.

Os registros extraídos ficam salvos no arquivo `data.csv`.

## Estrutura

- `app.py` – aplicação Flask responsável por receber uploads, executar OCR e armazenar os dados.
- `templates/index.html` – página HTML simples para upload e pesquisa.
- `data.csv` – arquivo utilizado para armazenar os dados extraídos.

## Observação

O método de extração é baseado em OCR simples e pode exigir ajustes de acordo com o formato real dos arquivos de origem.

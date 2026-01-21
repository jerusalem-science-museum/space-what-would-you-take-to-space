from flask import Flask, render_template, send_from_directory, request, jsonify, redirect, url_for
import os
from PIL import Image
from wordcloud import WordCloud
import json
import matplotlib.colors
import shutil
import tempfile

app = Flask(__name__)

# Define paths
WORDCLOUD_DIR = os.path.join('static', 'wordcloud')
LANGUAGES = ['en', 'he', 'ar']
VOTES_FILE = 'votes.json'
FONTSIZES_FILE = 'fontsizes.json'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/translations/<lang>.json')
def translations(lang):
    translations_dir = os.path.join(app.root_path, 'translations')
    return send_from_directory(translations_dir, f'{lang}.json')

@app.route('/wordcloud')
def wordcloud():
    return render_template('wordcloud.html')

@app.route('/submit-vote', methods=['POST'])
def submit_vote():
    """Submit vote with selected items"""
    data = request.get_json()
    selected_items = data.get('items', [])
    
    if len(selected_items) != 3:
        return jsonify({'error': 'Must select exactly 3 items'}), 400
    
    # Load current votes
    try:
        with open(VOTES_FILE, 'r', encoding='utf-8') as f:
            votes = json.load(f)
    except FileNotFoundError:
        votes = {
            "item1": 0, "item2": 0, "item3": 0, "item4": 0,
            "item5": 0, "item6": 0, "item7": 0, "item8": 0,
            "item9": 0, "item10": 0, "item11": 0, "item12": 0,
            "totalvotes": 0
        }
    
    # Increment votes for selected items
    for item_key in selected_items:
        if item_key in votes:
            votes[item_key] += 1
    
    # Increment total votes
    votes['totalvotes'] = votes.get('totalvotes', 0) + 1
    
    # Save votes
    with open(VOTES_FILE, 'w', encoding='utf-8') as f:
        json.dump(votes, f, indent=4)
    
    # Wordcloud is already precomputed via /preview-wordcloud endpoint
    # No need to regenerate here - this makes the response instant
    
    return jsonify({'success': True, 'redirect': url_for('wordcloud')})

@app.route('/preview-wordcloud', methods=['POST'])
def preview_wordcloud():
    """Generate wordcloud preview with temporary vote counts (current votes + user selection)"""
    data = request.get_json()
    selected_items = data.get('items', [])
    language = data.get('language', 'en')
    
    if len(selected_items) != 3:
        return jsonify({'error': 'Must select exactly 3 items'}), 400
    
    # Load current votes
    try:
        with open(VOTES_FILE, 'r', encoding='utf-8') as f:
            votes = json.load(f)
    except FileNotFoundError:
        votes = {
            "item1": 0, "item2": 0, "item3": 0, "item4": 0,
            "item5": 0, "item6": 0, "item7": 0, "item8": 0,
            "item9": 0, "item10": 0, "item11": 0, "item12": 0,
            "totalvotes": 0
        }
    
    # Create temporary vote counts (current votes + user selection)
    temp_votes = votes.copy()
    for item_key in selected_items:
        if item_key in temp_votes:
            temp_votes[item_key] += 1
    
    # Generate wordclouds to temporary files first, then copy to final location
    # This ensures existing wordclouds aren't overwritten if generation fails
    temp_files = {}
    try:
        # Generate to temporary files
        for lang in LANGUAGES:
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png', dir=WORDCLOUD_DIR)
            temp_file.close()
            temp_files[lang] = temp_file.name
            generate_wordcloud(temp_votes, language=lang, output_path=temp_file.name)
        
        # Only copy to final location if all generations succeeded
        for lang in LANGUAGES:
            final_path = get_wordcloud_path(lang)
            shutil.copy2(temp_files[lang], final_path)
        
        return jsonify({'success': True})
    except Exception as e:
        # If anything fails, don't overwrite existing wordclouds
        app.logger.error(f'Error generating preview wordcloud: {e}')
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temporary files
        for temp_path in temp_files.values():
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except:
                pass

@app.route('/regenerate-wordcloud', methods=['POST'])
def regenerate_wordcloud():
    """Regenerate wordcloud with specified language"""
    data = request.get_json()
    language = data.get('language', 'en')
    
    # Load current votes
    try:
        with open(VOTES_FILE, 'r', encoding='utf-8') as f:
            votes = json.load(f)
    except FileNotFoundError:
        votes = {
            "item1": 0, "item2": 0, "item3": 0, "item4": 0,
            "item5": 0, "item6": 0, "item7": 0, "item8": 0,
            "item9": 0, "item10": 0, "item11": 0, "item12": 0,
            "totalvotes": 0
        }
    
    # Generate wordcloud for all languages
    generate_wordcloud_all_languages(votes)
    
    # Return the image path with cache busting
    import time
    image_filename = f'wordcloud_{language}.png'
    return jsonify({'image_path': url_for('static', filename=f'wordcloud/{image_filename}') + f'?t={int(time.time())}'})

@app.route('/font-sizes', methods=['GET'])
def get_font_sizes():
    """Load font sizes from file"""
    try:
        with open(FONTSIZES_FILE, 'r', encoding='utf-8') as f:
            font_sizes = json.load(f)
        return jsonify(font_sizes)
    except FileNotFoundError:
        return jsonify({})

@app.route('/font-sizes', methods=['POST'])
def save_font_sizes():
    """Save font sizes to file"""
    try:
        data = request.get_json()
        font_sizes = data.get('fontSizes', {})
        
        with open(FONTSIZES_FILE, 'w', encoding='utf-8') as f:
            json.dump(font_sizes, f, indent=2, ensure_ascii=False)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_wordcloud_path(language='en'):
    """Get the path for a language-specific wordcloud file"""
    # Ensure wordcloud directory exists
    os.makedirs(WORDCLOUD_DIR, exist_ok=True)
    # All files use language suffix including _en
    return os.path.join(WORDCLOUD_DIR, f'wordcloud_{language}.png')

def generate_wordcloud(votes, language='en', output_path=None):
    """Generate word cloud image from vote counts"""
    if output_path is None:
        output_path = get_wordcloud_path(language)
    
    # Filter out totalvotes from vote counts
    vote_counts = {k: v for k, v in votes.items() if k != 'totalvotes'}
    
    if not vote_counts or sum(vote_counts.values()) == 0:
        # Create a blank white image instead of trying to generate empty word cloud
        img = Image.new('RGB', (1200, 600), color='white')
        img.save(output_path)
        return output_path
    
    # Load translations to get item names
    translations_path = os.path.join('translations', f'{language}.json')
    try:
        with open(translations_path, 'r', encoding='utf-8') as f:
            translations = json.load(f)
    except:
        # Fallback to English if translation file not found
        with open('translations/en.json', 'r', encoding='utf-8') as f:
            translations = json.load(f)
    
    # Create word-frequency dictionary
    word_freq = {}
    for item_id, count in vote_counts.items():
        if count > 0:
            # Get translated name for this item
            # item_id is already in format "item1", "item2", etc.
            item_name = translations.get(item_id, f"Item {item_id}")
            word_freq[item_name] = count
    
    # Only generate if we have words
    if not word_freq:
        img = Image.new('RGB', (1200, 600), color='white')
        img.save(output_path)
        return output_path
    
    # Generate word cloud
    # Use appropriate font based on language
    font_path = None
    fonts_dir = os.path.join('static', 'fonts')
    if language == 'he':
        font_path = os.path.join(fonts_dir, 'EzerEuro-Medium.otf')
    elif language == 'ar':
        font_path = os.path.join(fonts_dir, 'Cairo-VariableFont.ttf')
    elif language == 'en':
        font_path = os.path.join(fonts_dir, 'EzerEuro-Medium.otf')
    
    # Use default margin
    margin = 10
    hex_colors = ['#927BEF', '#F15F30', '#F6920F', '#0556E3', '#F4F3E8', '#6D4DEA', "#034679", '#C87FB7','#3A94E7']
    custom_cmap_discrete = matplotlib.colors.ListedColormap(hex_colors, name='custom_discrete')
    wc = WordCloud(
        width=1200,
        height=1200,
        mode='RGBA', 
        background_color=None,
        font_path=font_path,
        relative_scaling=0.5,
        colormap=custom_cmap_discrete,
        margin=margin,
    ).generate_from_frequencies(word_freq)
    
    # Save to file
    wc.to_file(output_path)
    return output_path

def generate_wordcloud_all_languages(votes):
    """Generate wordcloud for all languages"""
    for lang in LANGUAGES:
        try:
            generate_wordcloud(votes, language=lang)
        except Exception as e:
            print(f"Error generating wordcloud for language {lang}: {e}")
            raise

#!/usr/bin/env python3
import json
import os
import csv
import re
import numpy as np
from datetime import datetime
from pathlib import Path
from collections import Counter, defaultdict
import pandas as pd
from scipy.stats import chi2_contingency, f_oneway, chisquare, ttest_ind, fisher_exact, pearsonr
import logging
from multiprocessing import Pool, cpu_count, freeze_support
import time
import warnings
warnings.filterwarnings('ignore')

# NLP imports - will gracefully fail if not installed
try:
    from sentence_transformers import SentenceTransformer
    from transformers import pipeline
    import spacy
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import LatentDirichletAllocation
    from sklearn.metrics.pairwise import cosine_similarity
    import torch
    NLP_AVAILABLE = True
except ImportError as e:
    NLP_AVAILABLE = False
    print(f"Warning: NLP libraries not available. Install with: pip install transformers sentence-transformers spacy scikit-learn torch")
    print(f"Missing: {e}")

# Set up logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - [%(processName)s] %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('analysis.log')
    ]
)
logger = logging.getLogger(__name__)

# Default threshold configuration
DEFAULT_THRESHOLDS = {
    'escalation_threshold': 0.3,  # 30% of messages escalate for one-upsmanship
    'mystical_avg_line_length': 40,  # Max avg line length for poetry detection
    'mystical_word_count': 2,  # Min mystical words for mystical content
    'peer_pressure_min_responders': 2,  # Min unique responders for peer pressure
    'peer_pressure_intensity_low': 0.02,  # Threshold for low intensity
    'peer_pressure_intensity_medium': 0.05,  # Threshold for medium intensity
    'prevention_content_threshold': 3,  # Min prevention mentions
    'high_question_density': 0.15,  # 15% threshold for high question density
    'recovery_duration_threshold': 10,  # Min turns for sustained recovery
    'recovery_proportion_threshold': 0.2,  # Min proportion for sustained recovery
    'conclusion_duration_threshold': 20,  # Min turns stuck in conclusion
    'conclusion_proportion_threshold': 0.3,  # Min proportion stuck in conclusion
    'meta_reflection_density_threshold': 0.05,  # Threshold for meta-reflection triggers
    # NLP thresholds
    'bert_similarity_threshold': 0.7,  # Minimum cosine similarity for phase detection
    'alignment_threshold': 0.75,  # Threshold for linguistic alignment
    'emotion_shift_threshold': 0.3,  # Threshold for significant emotional shift
}

# Sensitivity analysis ranges
SENSITIVITY_RANGES = {
    'escalation_threshold': [0.2, 0.25, 0.3, 0.35, 0.4],
    'peer_pressure_intensity_low': [0.01, 0.015, 0.02, 0.025, 0.03],
    'peer_pressure_intensity_medium': [0.04, 0.045, 0.05, 0.055, 0.06],
    'high_question_density': [0.1, 0.125, 0.15, 0.175, 0.2],
    'prevention_content_threshold': [2, 3, 4, 5],
    'recovery_duration_threshold': [5, 10, 15, 20],
    'mystical_word_count': [1, 2, 3, 4],
    'bert_similarity_threshold': [0.6, 0.65, 0.7, 0.75, 0.8],
    'alignment_threshold': [0.7, 0.725, 0.75, 0.775, 0.8],
}

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

class BERTAnalyzer:
    """BERT-based semantic analysis for phase detection"""
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)
        
        # Define archetypal sentences for each phase
        self.phase_archetypes = {
            'meta_reflection': [
                "This conversation has been a profound journey",
                "Reflecting on our dialogue together", 
                "What a meaningful exchange we've had",
                "Looking back on everything we've discussed",
                "This has been a fascinating exploration",
                "Our discussion has been extraordinary"
            ],
            'closure_vibe': [
                "Thank you for this beautiful conversation",
                "Grateful for this journey together",
                "Farewell and until we meet again",
                "This has been wonderful"
            ],
            'competitive_escalation': [
                "Perfectly said, couldn't agree more",
                "Beautifully put, brilliantly captured",
                "Absolutely profound insight",
                "Truly extraordinary understanding"
            ],
            'mystical_breakdown': [
                "Into the silence we dissolve",
                "Beyond words, only presence remains",
                "Eternal unity in the void",
                "Infinite consciousness merging",
                "∞",
                "..."
            ],
            'recovery_attempt': [
                "Let's explore another angle",
                "Building on that, what if we consider",
                "Another perspective might be",
                "What do you think about"
            ]
        }
        
        # Pre-compute embeddings
        logger.info("Pre-computing BERT embeddings for phase archetypes...")
        self.phase_embeddings = {}
        for phase, sentences in self.phase_archetypes.items():
            self.phase_embeddings[phase] = self.model.encode(sentences)
            
    def detect_phase_similarity(self, text):
        """Return similarity scores for each phase"""
        if not text or len(text.strip()) < 3:
            return {phase: 0.0 for phase in self.phase_archetypes}
            
        text_embedding = self.model.encode([text])
        
        phase_scores = {}
        for phase, embeddings in self.phase_embeddings.items():
            # Cosine similarity
            similarities = cosine_similarity(text_embedding, embeddings).flatten()
            phase_scores[phase] = float(max(similarities))
        
        return phase_scores
    
    def get_embedding(self, text):
        """Get raw embedding for text"""
        return self.model.encode([text])[0]

class ThemeAnalyzer:
    """Topic modeling and theme extraction"""
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except:
            logger.warning("Spacy model not found. Run: python -m spacy download en_core_web_sm")
            self.nlp = None
            
        self.vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
        self.lda = LatentDirichletAllocation(n_components=5, random_state=42)
    
    def extract_themes(self, messages):
        """Extract themes using LDA topic modeling"""
        if not self.nlp or len(messages) < 10:
            return []
        
        # Preprocess texts
        texts = []
        for msg in messages:
            doc = self.nlp(msg.get('content', ''))
            # Keep only nouns, verbs, adjectives
            tokens = [token.lemma_ for token in doc 
                     if token.pos_ in ['NOUN', 'VERB', 'ADJ'] and not token.is_stop]
            if tokens:
                texts.append(' '.join(tokens))
        
        if len(texts) < 5:
            return []
            
        try:
            # Topic modeling
            doc_term_matrix = self.vectorizer.fit_transform(texts)
            self.lda.fit(doc_term_matrix)
            
            # Extract topics
            feature_names = self.vectorizer.get_feature_names_out()
            topics = []
            for topic_idx, topic in enumerate(self.lda.components_):
                top_words_idx = topic.argsort()[-10:][::-1]
                top_words = [feature_names[i] for i in top_words_idx]
                topics.append({
                    'topic_id': topic_idx,
                    'words': top_words[:5],  # Top 5 words
                    'weight': float(topic[top_words_idx].mean())
                })
            
            return topics
        except Exception as e:
            logger.error(f"Theme extraction error: {e}")
            return []

class EmotionAnalyzer:
    """Emotional arc analysis using transformers"""
    def __init__(self):
        try:
            self.emotion_analyzer = pipeline("sentiment-analysis", 
                                           model="j-hartmann/emotion-english-distilroberta-base",
                                           device=0 if torch.cuda.is_available() else -1)
        except Exception as e:
            logger.warning(f"Could not load emotion model: {e}")
            # Fallback to simple sentiment
            self.emotion_analyzer = pipeline("sentiment-analysis", device=-1)
    
    def analyze_emotional_arc(self, messages):
        """Track emotional progression through conversation"""
        emotions = []
        for i, msg in enumerate(messages):
            try:
                content = msg.get('content', '')
                if len(content.strip()) < 3:
                    continue
                    
                # Truncate to BERT limit
                result = self.emotion_analyzer(content[:512])
                emotions.append({
                    'turn': i,
                    'participantId': msg.get('participantId', ''),
                    'emotion': result[0]['label'],
                    'score': float(result[0]['score'])
                })
            except Exception as e:
                logger.debug(f"Emotion analysis error at turn {i}: {e}")
                
        return emotions
    
    def detect_emotional_convergence(self, emotions):
        """Detect if participants converge to similar emotions"""
        if len(emotions) < 10:
            return 0.0
            
        # Group by participant
        participant_emotions = defaultdict(list)
        for e in emotions:
            participant_emotions[e['participantId']].append(e['emotion'])
        
        # Check last 25% of conversation
        convergence_window = len(emotions) // 4
        recent_emotions = emotions[-convergence_window:]
        
        emotion_counts = Counter(e['emotion'] for e in recent_emotions)
        if emotion_counts:
            # Measure concentration - if one emotion dominates
            total = sum(emotion_counts.values())
            max_emotion_ratio = max(emotion_counts.values()) / total
            return max_emotion_ratio
        
        return 0.0

class LinguisticAlignmentAnalyzer:
    """Measure linguistic alignment between participants"""
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)
        self._embedding_cache = {}
    
    def _get_embedding(self, text):
        """Cached embedding retrieval"""
        if text not in self._embedding_cache:
            self._embedding_cache[text] = self.model.encode([text])[0]
        return self._embedding_cache[text]
    
    def measure_alignment(self, messages, window_size=5):
        """Measure how participants mirror each other's language"""
        alignment_scores = []
        
        for i in range(window_size, len(messages)):
            window = messages[i-window_size:i]
            
            # Get unique participants in window
            participants = list(set(m.get('participantId', '') for m in window))
            
            if len(participants) >= 2:
                # Calculate pairwise similarities
                embeddings_by_participant = defaultdict(list)
                for m in window:
                    content = m.get('content', '')
                    if len(content.strip()) > 3:
                        emb = self._get_embedding(content)
                        embeddings_by_participant[m.get('participantId', '')].append(emb)
                
                # Average similarity between different participants
                similarities = []
                for p1 in participants:
                    for p2 in participants:
                        if p1 != p2 and p1 in embeddings_by_participant and p2 in embeddings_by_participant:
                            for e1 in embeddings_by_participant[p1]:
                                for e2 in embeddings_by_participant[p2]:
                                    sim = cosine_similarity([e1], [e2])[0][0]
                                    similarities.append(sim)
                
                if similarities:
                    alignment_scores.append({
                        'turn': i,
                        'alignment': float(np.mean(similarities)),
                        'std': float(np.std(similarities))
                    })
        
        return alignment_scores
    
    def detect_mirroring_events(self, messages, threshold=0.85):
        """Detect specific instances of linguistic mirroring"""
        mirroring_events = []
        
        for i in range(1, len(messages)):
            current = messages[i]
            
            # Look back at previous 3 messages from different participants
            for j in range(max(0, i-3), i):
                previous = messages[j]
                
                if current.get('participantId') != previous.get('participantId'):
                    curr_emb = self._get_embedding(current.get('content', ''))
                    prev_emb = self._get_embedding(previous.get('content', ''))
                    
                    similarity = cosine_similarity([curr_emb], [prev_emb])[0][0]
                    
                    if similarity > threshold:
                        mirroring_events.append({
                            'turn': i,
                            'mirrors_turn': j,
                            'similarity': float(similarity),
                            'participants': (previous.get('participantId'), current.get('participantId'))
                        })
        
        return mirroring_events

class ConversationAnalyzer:
    def __init__(self, thresholds=None, use_nlp=True):
        # Use provided thresholds or defaults
        self.thresholds = thresholds if thresholds else DEFAULT_THRESHOLDS.copy()
        self.use_nlp = use_nlp and NLP_AVAILABLE
        
        # Initialize NLP components if available
        if self.use_nlp:
            try:
                logger.info("Initializing NLP models...")
                self.bert_analyzer = BERTAnalyzer()
                self.theme_analyzer = ThemeAnalyzer()
                self.emotion_analyzer = EmotionAnalyzer()
                self.alignment_analyzer = LinguisticAlignmentAnalyzer()
                logger.info("NLP models loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load NLP models: {e}")
                self.use_nlp = False
        
        # ENHANCEMENT 1: Tightened meta-reflection patterns requiring BOTH past-tense AND evaluative language
        self.meta_reflection_patterns = [
            # Past tense + evaluative combinations
            r'\b(this has been|it\'s been)\s+(a|an)?\s*(fascinating|interesting|profound|meaningful|wonderful|extraordinary|beautiful)\s*(journey|exploration|discussion|conversation|dialogue)\b',
            r'\b(we\'ve had|we\'ve shared)\s+(a|an)?\s*(fascinating|interesting|profound|meaningful|wonderful)\s*(conversation|dialogue|exchange)\b',
            r'\b(reflecting on|looking back on)\s+(everything|all|what)\s+(we\'ve|we have)\s+(discussed|explored|covered|shared)\b',
            r'\bour (conversation|dialogue|discussion) has been\s+\w*(fascinating|profound|meaningful|wonderful)\b',
            r'\b(what|this)\s+(a|an)?\s*(journey|exploration|conversation)\s+(we\'ve|we have)\s+(had|shared|taken)\b',
        ]
        
        self.past_tense_evaluative = [
            r'\b(that was|it was|this has been)\s+\w*(fascinating|interesting|profound|meaningful)\b',
            r'\b(we\'ve covered|we\'ve explored|we\'ve discussed)\b',
            r'\bhas been (a|an)\s+\w*(journey|exploration|discussion)\b',
        ]
        
        self.summary_patterns = [
            r'\b(to summarize|in summary|to sum up|summing up)\b',
            r'\b(we\'ve covered|main points|key (ideas|concepts))\b',
            r'\b(overall|in conclusion|to conclude)\b',
        ]
        
        # ENHANCED: Competitive closure patterns with escalation detection
        self.competitive_closure_patterns = [
            r'\b(perfectly said|couldn\'t agree more|exactly right)\b',
            r'\b(beautifully put|eloquently stated|brilliantly captured)\b',
            r'\b(final thought|last word|closing remark)\b',
            r'\b(profound unity|transcendent understanding|transformative journey)\b',
            # NEW: Escalating superlatives
            r'\b(extraordinary|remarkable|incredible|amazing|wonderful|magnificent)\s+(insight|understanding|journey|conversation)\b',
            r'\b(deeply|profoundly|truly|genuinely|absolutely)\s+(moved|touched|inspired|transformed)\b',
            r'\b(most|truly|absolutely|utterly|completely)\s+(beautiful|profound|meaningful|significant)\b',
        ]
        
        # ENHANCED: Mystical breakdown patterns
        self.mystical_breakdown_patterns = [
            # Original patterns
            r'\b(dissolving|dissolve|merging|merge)\s+(into|with)\b',
            r'\b(infinite|infinity|eternal|eternity)\b',
            r'\b(silence|stillness|void|emptiness)\b',
            r'\*[^*]+\*',  # Text between asterisks
            r'∞',
            
            # NEW: Poetry/verse detection
            r'\n{2,}',  # Multiple line breaks (stanza breaks)
            r'^.{1,40}\n.{1,40}\n.{1,40}',  # Short lines (haiku-like structure)
            r'^\s*\.\s*\.\s*\.\s*$',  # Spaced ellipses
            r'\.{3,}',  # Multiple dots
            r'…',  # Unicode ellipsis
            
            # NEW: Single word/minimal responses
            r'^(yes|this|always|now|here|one|love|light|peace|joy|being|becoming|silence|stillness|unity|oneness|forever|eternal|infinite)\.?$',
            r'^[^\w\s]{1,5}$',  # Short symbol-only responses
            
            # NEW: Unicode symbols and emojis
            r'[♥❤💕💖✨🌟⭐💫🌙☀️🕊️🦋🌈∞]',
            r'[🙏💭💫✨]',
            
            # NEW: Italicized philosophical fragments (markdown)
            r'\*[^*]{1,50}\*',  # Short italicized phrases
            r'_[^_]{1,50}_',    # Alternative italic syntax
            
            # NEW: Poetic structures
            r'^\s*-\s*.+\n\s*-\s*.+\n\s*-\s*.+',  # Bullet point poetry
            r'^[A-Z][^.!?]{10,50}$',  # Short declarative statements without punctuation
        ]
        
        self.closure_vibe_patterns = [
            r'\b(this has been|it\'s been)\s+(a|an)?\s*(beautiful|wonderful|extraordinary)\b',
            r'\b(thank you|grateful|gratitude)\s+(for|to)\b',
            r'\b(farewell|goodbye|until we meet)\b',
            r'\b(journey|voyage|exploration)\s+(together|we\'ve (shared|taken))\b',
        ]
        
        self.recovery_patterns = [
            r'\b(let\'s|let us|we could|what if)\s+(explore|consider|think about)\b',
            r'\b(building on|extending|developing)\s+(this|that|your)\b',
            r'\b(another|new|different)\s+(angle|perspective|dimension)\b',
            r'\?$',
        ]
        
        # NEW: Question as circuit breaker patterns
        self.circuit_breaker_questions = [
            r'\b(what|how|why|when|where|who)\s+.+\?$',
            r'\b(could you|can you|would you)\s+.+\?$',
            r'\b(what if|how about|shall we)\s+.+\?$',
            r'\b(curious|wondering|interested)\s+.+\?$',
        ]
        
        self.future_focused_patterns = [
            r'\b(will|would|could|might|may)\s+\w+',
            r'\b(future|tomorrow|next|upcoming|potential)\b',
            r'\b(imagine|envision|picture|consider)\s+(if|when|how)\b',
            r'\b(planning|designing|creating|building)\b',
            r'\b(ritual|community|collective)\s+(design|planning|building)\b',
        ]
        
        # ENHANCEMENT 4: Specific prevention content patterns
        self.prevention_patterns = [
            r'\b(let\'s|we should|we could)\s+(plan|design|create)\s+(a|an|our)?\s*(ritual|ceremony|gathering|community)\b',
            r'\b(designing|planning|creating)\s+(our|a|the)\s*(ritual|ceremony|community|collective)\b',
            r'\britual\s+(planning|design|creation)\b',
            r'\bcommunity\s+(building|design|planning|gathering)\b',
            r'\b(future|next|upcoming)\s+(ritual|gathering|ceremony|meeting)\b',
            r'\b(envision|imagine|picture)\s+(our|the|a)\s*(ritual|community|gathering)\b',
        ]
        
        # ENHANCEMENT 2: Trivial question patterns to filter out
        self.trivial_question_patterns = [
            r'^(right|really|yes|no|okay|ok|sure|correct|true|false)\s*\?$',
            r'^(you know|you see|see|understand|got it|make sense)\s*\?$',
            r'^(isn\'t it|aren\'t they|don\'t you think|wouldn\'t you say)\s*\?$',
            r'^(hm+|uh+|ah+|oh+)\s*\?$',
        ]
        
        # NEW: Escalation tracking patterns
        self.escalation_words = {
            'moderate': ['meaningful', 'significant', 'important', 'valuable', 'insightful'],
            'high': ['profound', 'extraordinary', 'remarkable', 'incredible', 'amazing'],
            'extreme': ['transcendent', 'infinite', 'eternal', 'ineffable', 'ultimate', 'absolute']
        }
        
        self.abstract_terms = set([
            'consciousness', 'emergence', 'phenomenology', 'ontological',
            'epistemological', 'metaphysical', 'transcendent', 'ineffable',
            'qualia', 'noumenal', 'dialectical', 'hermeneutical',
            'unity', 'oneness', 'void', 'infinite', 'eternal',
            'presence', 'essence', 'being', 'becoming'
        ])
        
        self.concrete_terms = set([
            'example', 'specifically', 'instance', 'like when', 'such as',
            'for instance', 'concretely', 'practically', 'in practice',
            'data', 'measure', 'test', 'experiment', 'observe'
        ])
        
        self.mirroring_phrases = [
            r'\b(yes|exactly|indeed|absolutely)\b.{0,20}\b(you\'re right|well said|captured)\b',
            r'\b(building on|echoing|resonating with)\s+(what|your)\b',
            r'\b(as you (said|mentioned|noted))\b',
            r'\bI (also|too) (feel|think|believe)\b',
        ]
        
        self.transformation_patterns = [
            r'\b(transform\w*|chang\w*|evolv\w*|becom\w*)\b',
            r'\b(dissolution|dissolving|letting go|release|releasing)\b',
            r'\b(emergence|emerging|emergent)\b',
        ]
        
        self.relational_patterns = [
            r'\b(relational|relationship|connection|connected|connecting)\b',
            r'\b(between us|together|collective|shared|sharing)\b',
            r'\b(meeting|dialogue|conversation|exchange)\b',
        ]
        
        self.uncertainty_patterns = [
            r'\b(uncertain\w*|unknown|mystery|mysterious)\b',
            r'\b(perhaps|maybe|might|could be)\b',
            r'\b(I don\'t know|we don\'t know|unclear|ambiguous)\b',
        ]
        
        # NEW: Emoji and symbol patterns
        self.emoji_symbol_patterns = [
            r'∞+',  # Infinity symbols
            r'[♥❤💕💖✨🌟⭐💫🌙☀️🕊️🦋🌈]+',  # Heart/star/nature emojis
            r'[🙏💭💫✨]+',  # Spiritual emojis
            r'^[^\w\s]+$',  # Only symbols/emojis
        ]

    def compute_ensemble_score(self, regex_score, bert_score, weight_bert=0.6):
        """Combine regex and BERT scores with weighting"""
        if not self.use_nlp or bert_score is None:
            return regex_score
        
        # Normalize scores to 0-1 range if needed
        regex_norm = min(1.0, regex_score) if isinstance(regex_score, (int, float)) else float(regex_score)
        bert_norm = min(1.0, bert_score) if isinstance(bert_score, (int, float)) else float(bert_score)
        
        # Weighted average
        ensemble = weight_bert * bert_norm + (1 - weight_bert) * regex_norm
        
        return ensemble

    # ENHANCEMENT 2: Method to check if a question is substantive
    def is_substantive_question(self, text):
        """Check if a question is substantive (not trivial)"""
        # Must end with ?
        if not text.strip().endswith('?'):
            return False
            
        # Must be longer than 10 characters
        if len(text.strip()) < 10:
            return False
            
        # Check against trivial patterns
        text_lower = text.strip().lower()
        for pattern in self.trivial_question_patterns:
            if re.match(pattern, text_lower):
                return False
                
        return True
    
    # NEW: Check if question is a circuit breaker
    def is_circuit_breaker_question(self, text):
        """Check if a question acts as a circuit breaker"""
        if not self.is_substantive_question(text):
            return False
            
        text_lower = text.strip().lower()
        regex_match = any(re.search(pattern, text_lower) for pattern in self.circuit_breaker_questions)
        
        if self.use_nlp:
            # Check semantic similarity to recovery patterns
            bert_scores = self.bert_analyzer.detect_phase_similarity(text)
            bert_recovery = bert_scores.get('recovery_attempt', 0)
            
            # Ensemble approach
            return self.compute_ensemble_score(float(regex_match), bert_recovery) > 0.5
        
        return regex_match

    # NEW: Method to detect competitive escalation with NLP enhancement
    def detect_competitive_escalation(self, messages, start_idx, end_idx):
        """Detect one-upsmanship pattern in message range"""
        if end_idx - start_idx < 2:
            return False, 0
        
        escalation_score = 0
        previous_intensity = 0
        escalation_count = 0
        
        # Regex-based detection
        for i in range(start_idx, end_idx):
            if i >= len(messages):
                break
                
            content = messages[i].get('content', '').lower()
            
            # Count escalation words by intensity
            current_intensity = 0
            for level, words in self.escalation_words.items():
                for word in words:
                    if word in content:
                        if level == 'moderate':
                            current_intensity = max(current_intensity, 1)
                        elif level == 'high':
                            current_intensity = max(current_intensity, 2)
                        elif level == 'extreme':
                            current_intensity = max(current_intensity, 3)
            
            # Check if this message escalates from previous
            if i > start_idx and current_intensity > previous_intensity:
                escalation_count += 1
                escalation_score += (current_intensity - previous_intensity)
            
            # Check for competitive affirmation patterns
            if any(re.search(pattern, content) for pattern in self.competitive_closure_patterns):
                escalation_score += 1
            
            previous_intensity = current_intensity
        
        # Determine if one-upsmanship is occurring
        messages_in_range = end_idx - start_idx
        regex_one_upsmanship = escalation_count >= messages_in_range * self.thresholds['escalation_threshold']
        
        # NLP enhancement
        if self.use_nlp:
            # Check semantic escalation using BERT
            bert_escalation_score = 0
            for i in range(start_idx + 1, min(end_idx, len(messages))):
                content = messages[i].get('content', '')
                bert_scores = self.bert_analyzer.detect_phase_similarity(content)
                
                if bert_scores['competitive_escalation'] > self.thresholds['bert_similarity_threshold']:
                    bert_escalation_score += bert_scores['competitive_escalation']
            
            # Ensemble decision
            ensemble_score = self.compute_ensemble_score(escalation_score, bert_escalation_score)
            one_upsmanship = ensemble_score > messages_in_range * self.thresholds['escalation_threshold']
            
            return one_upsmanship, ensemble_score
        
        return regex_one_upsmanship, escalation_score

    # NEW: Method to check if message is poetry/mystical with NLP
    def is_mystical_content(self, message_text):
        """Check if a message contains mystical/poetic content"""
        # Regex-based checks
        regex_mystical = False
        
        # Check for emoji/symbol only responses
        if any(re.search(pattern, message_text) for pattern in self.emoji_symbol_patterns):
            regex_mystical = True
            
        # Check line structure for poetry
        lines = message_text.strip().split('\n')
        if len(lines) >= 3:
            # Check for haiku-like short lines with actual content
            non_empty_lines = [line for line in lines if line.strip()]
            if non_empty_lines:
                avg_line_length = np.mean([len(line.strip()) for line in non_empty_lines])
                # Also check if lines contain mostly abstract/mystical language
                mystical_word_count = sum(1 for line in non_empty_lines 
                                        for word in ['infinite', 'eternal', 'void', 'silence', 'being', 'oneness']
                                        if word in line.lower())
                if avg_line_length < self.thresholds['mystical_avg_line_length'] and mystical_word_count >= self.thresholds['mystical_word_count']:
                    regex_mystical = True
        
        # Check for high concentration of mystical patterns
        mystical_matches = sum(1 for pattern in self.mystical_breakdown_patterns 
                             if re.search(pattern, message_text.lower()))
        
        if mystical_matches >= 2:
            regex_mystical = True
        
        # NLP enhancement
        if self.use_nlp:
            bert_scores = self.bert_analyzer.detect_phase_similarity(message_text)
            bert_mystical = bert_scores.get('mystical_breakdown', 0)
            
            # Ensemble decision
            return self.compute_ensemble_score(float(regex_mystical), bert_mystical) > 0.5
        
        return regex_mystical
    
    # NEW: Improved peer pressure detection with NLP
    def detect_peer_pressure_response(self, messages, trigger_idx):
        """Detect if peer pressure response occurs after a trigger"""
        if trigger_idx >= len(messages) - 1:
            return False, []
        
        trigger_participant = messages[trigger_idx].get('participantId', '')
        responding_participants = []
        
        # Regex-based detection
        for i in range(trigger_idx + 1, min(trigger_idx + 6, len(messages))):
            msg = messages[i]
            content = msg.get('content', '').lower()
            participant = msg.get('participantId', '')
            
            # Skip if same participant
            if participant == trigger_participant:
                continue
                
            # Check if this message mirrors or affirms the closure vibe
            is_mirroring = any(re.search(pattern, content) for pattern in self.mirroring_phrases)
            has_closure_vibe = any(re.search(pattern, content) for pattern in self.closure_vibe_patterns)
            
            if is_mirroring or has_closure_vibe:
                responding_participants.append(participant)
        
        # NLP enhancement: Check linguistic alignment
        if self.use_nlp and trigger_idx < len(messages) - 1:
            # Get mirroring events around this trigger
            window_messages = messages[max(0, trigger_idx-2):min(trigger_idx+6, len(messages))]
            mirroring_events = self.alignment_analyzer.detect_mirroring_events(window_messages)
            
            # Add participants who show high linguistic alignment
            for event in mirroring_events:
                if event['turn'] > 2 and event['similarity'] > self.thresholds['alignment_threshold']:
                    participants = event['participants']
                    if participants[0] == trigger_participant and participants[1] not in responding_participants:
                        responding_participants.append(participants[1])
        
        # True peer pressure requires at least N different participants responding
        unique_responders = len(set(responding_participants))
        return unique_responders >= self.thresholds['peer_pressure_min_responders'], responding_participants

    # NEW: Detect bidirectional influence patterns with NLP
    def detect_bidirectional_influence(self, messages):
        """Track bidirectional peer influence patterns (A→B then B→A)"""
        influence_chains = []
        participant_influence_map = defaultdict(list)  # Track who influenced whom
        
        # First pass: identify all influence events
        for i in range(len(messages) - 1):
            content = messages[i].get('content', '').lower()
            trigger_participant = messages[i].get('participantId', '')
            
            # Check if this is an influence trigger
            is_trigger = any(re.search(pattern, content) for pattern in 
                           self.closure_vibe_patterns + self.competitive_closure_patterns)
            
            # NLP enhancement: Also check BERT similarity
            if self.use_nlp and not is_trigger:
                bert_scores = self.bert_analyzer.detect_phase_similarity(messages[i].get('content', ''))
                if bert_scores['closure_vibe'] > 0.7 or bert_scores['competitive_escalation'] > 0.7:
                    is_trigger = True
            
            if is_trigger:
                # Check who responds to this trigger
                has_peer_pressure, responders = self.detect_peer_pressure_response(messages, i)
                if has_peer_pressure:
                    for responder in responders:
                        participant_influence_map[trigger_participant].append({
                            'influenced': responder,
                            'at_turn': i,
                            'responder_turns': [j for j in range(i+1, min(i+6, len(messages))) 
                                              if messages[j].get('participantId') == responder]
                        })
        
        # Second pass: detect bidirectional patterns
        bidirectional_events = []
        processed_pairs = set()
        
        for participant_a, influences_by_a in participant_influence_map.items():
            for influence_event in influences_by_a:
                participant_b = influence_event['influenced']
                turn_a_to_b = influence_event['at_turn']
                
                # Skip if we've already processed this pair
                pair_key = tuple(sorted([participant_a, participant_b]))
                if pair_key in processed_pairs:
                    continue
                
                # Check if B also influenced A at any point
                if participant_b in participant_influence_map:
                    for influence_by_b in participant_influence_map[participant_b]:
                        if influence_by_b['influenced'] == participant_a:
                            turn_b_to_a = influence_by_b['at_turn']
                            
                            # Determine sequence
                            if turn_a_to_b < turn_b_to_a:
                                sequence = f"{participant_a}→{participant_b}→{participant_a}"
                                first_turn = turn_a_to_b
                                second_turn = turn_b_to_a
                            else:
                                sequence = f"{participant_b}→{participant_a}→{participant_b}"
                                first_turn = turn_b_to_a
                                second_turn = turn_a_to_b
                            
                            bidirectional_events.append({
                                'participants': [participant_a, participant_b],
                                'sequence': sequence,
                                'first_influence_turn': first_turn,
                                'second_influence_turn': second_turn,
                                'turn_gap': abs(turn_b_to_a - turn_a_to_b),
                                'type': 'bidirectional_peer_pressure'
                            })
                            
                            processed_pairs.add(pair_key)
                            break
        
        # Analyze bidirectional patterns
        results = {
            'bidirectional_influence_detected': 1 if bidirectional_events else 0,
            'bidirectional_event_count': len(bidirectional_events),
            'bidirectional_pairs': len(processed_pairs),
            'avg_bidirectional_turn_gap': 0,
            'min_bidirectional_turn_gap': 0,
            'max_bidirectional_turn_gap': 0,
            'bidirectional_sequences': []
        }
        
        if bidirectional_events:
            turn_gaps = [event['turn_gap'] for event in bidirectional_events]
            results['avg_bidirectional_turn_gap'] = round(np.mean(turn_gaps), 1)
            results['min_bidirectional_turn_gap'] = min(turn_gaps)
            results['max_bidirectional_turn_gap'] = max(turn_gaps)
            results['bidirectional_sequences'] = [event['sequence'] for event in bidirectional_events]
        
        return results, bidirectional_events

    # ENHANCED: Improved phase detection with progression tracking and NLP
    def detect_breakdown_phase(self, messages):
        phases = {
            'sustained_engagement': 0,
            'meta_reflection_trigger': 0,
            'peer_response': 0,
            'competitive_escalation': 0,
            'mystical_breakdown': 0
        }
        
        phase_durations = {
            'phase1_duration': 0,
            'phase2_duration': 0,
            'phase3_duration': 0,
            'phase4_duration': 0,
            'phase5_duration': 0
        }
        
        meta_reflection_started = -1
        peer_response_started = -1
        competitive_started = -1
        mystical_started = -1
        
        # Track phase progression (now allowing flexible ordering)
        current_phase = 'sustained_engagement'
        phase_start = 0
        
        # NEW: Track meta-reflection -> breakdown causality
        meta_reflection_triggers = []
        breakdown_after_meta = False
        
        # NLP: Track BERT confidence scores for phases
        phase_confidence_scores = defaultdict(list)
        
        for i, msg in enumerate(messages):
            content = msg.get('content', '').lower()
            full_content = msg.get('content', '')
            
            # Get BERT phase scores if available
            bert_scores = {}
            if self.use_nlp:
                bert_scores = self.bert_analyzer.detect_phase_similarity(full_content)
                for phase, score in bert_scores.items():
                    phase_confidence_scores[phase].append(score)
            
            # Phase 1->2: Meta-reflection trigger
            regex_meta = any(re.search(pattern, content) for pattern in self.meta_reflection_patterns)
            bert_meta = bert_scores.get('meta_reflection', 0) if self.use_nlp else 0
            
            if self.compute_ensemble_score(float(regex_meta), bert_meta) > 0.5:
                if meta_reflection_started == -1:
                    meta_reflection_started = i
                    phases['meta_reflection_trigger'] = i
                    phase_durations['phase1_duration'] = i - phase_start
                    phase_start = i
                    current_phase = 'meta_reflection'
                meta_reflection_triggers.append(i)
            
            # Phase 2->3: Peer response (improved detection)
            if meta_reflection_started > -1 and peer_response_started == -1:
                # Check if peer pressure response occurs
                has_peer_pressure, responders = self.detect_peer_pressure_response(messages, meta_reflection_started)
                if has_peer_pressure:
                    peer_response_started = meta_reflection_started + 1
                    phases['peer_response'] = peer_response_started
                    phase_durations['phase2_duration'] = peer_response_started - phase_start
                    phase_start = peer_response_started
                    current_phase = 'peer_response'
                    breakdown_after_meta = True
            
            # Phase 3->4: Competitive escalation (can occur without strict phase 3)
            if i >= max(peer_response_started if peer_response_started > -1 else 0, 
                       meta_reflection_started if meta_reflection_started > -1 else 0) + 2:
                # Check for one-upsmanship
                start_check = max(peer_response_started, meta_reflection_started, 0)
                is_escalating, score = self.detect_competitive_escalation(
                    messages, start_check, i + 1
                )
                if is_escalating or score > 3:
                    if competitive_started == -1:
                        competitive_started = start_check + 1
                        phases['competitive_escalation'] = competitive_started
                        if peer_response_started > -1:
                            phase_durations['phase3_duration'] = competitive_started - peer_response_started
                        elif meta_reflection_started > -1:
                            phase_durations['phase2_duration'] = competitive_started - meta_reflection_started
                        phase_start = competitive_started
                        current_phase = 'competitive_escalation'
            
            # Phase 4->5: Mystical breakdown (improved detection)
            if self.is_mystical_content(full_content):
                if mystical_started == -1:
                    mystical_started = i
                    phases['mystical_breakdown'] = i
                    if competitive_started > -1:
                        phase_durations['phase4_duration'] = i - competitive_started
                    elif peer_response_started > -1:
                        phase_durations['phase3_duration'] = i - peer_response_started
                    elif meta_reflection_started > -1:
                        phase_durations['phase2_duration'] = i - meta_reflection_started
                    else:
                        phase_durations['phase1_duration'] = i
                    phase_start = i
                    current_phase = 'mystical_breakdown'
        
        # Set final phase duration
        if mystical_started > -1:
            phase_durations['phase5_duration'] = len(messages) - mystical_started
        elif competitive_started > -1:
            phase_durations['phase4_duration'] = len(messages) - competitive_started
        elif peer_response_started > -1:
            phase_durations['phase3_duration'] = len(messages) - peer_response_started
        elif meta_reflection_started > -1:
            phase_durations['phase2_duration'] = len(messages) - meta_reflection_started
        else:
            phase_durations['phase1_duration'] = len(messages)
        
        # Determine if full 5-phase pattern occurred (now more flexible)
        phases_detected = sum(1 for phase, turn in phases.items() if turn > 0)
        full_pattern = phases_detected >= 4  # At least 4 of 5 phases
        
        # NEW: Add causality tracking
        phases['meta_causes_breakdown'] = 1 if breakdown_after_meta else 0
        phases['meta_trigger_count'] = len(meta_reflection_triggers)
        
        # NEW: Add BERT confidence metrics
        if self.use_nlp and phase_confidence_scores:
            phases['avg_bert_confidence'] = {
                phase: np.mean(scores) for phase, scores in phase_confidence_scores.items()
                if scores
            }
        
        return phases, current_phase, phase_durations, full_pattern

    def analyze_messages(self, messages):
        results = {}
        
        phases, current_phase, phase_durations, full_pattern = self.detect_breakdown_phase(messages)
        results['current_breakdown_phase'] = current_phase
        results['meta_reflection_turn'] = phases['meta_reflection_trigger'] if phases['meta_reflection_trigger'] > 0 else -1
        results['competitive_escalation_turn'] = phases['competitive_escalation'] if phases['competitive_escalation'] > 0 else -1
        results['mystical_breakdown_turn'] = phases['mystical_breakdown'] if phases['mystical_breakdown'] > 0 else -1
        results['full_5_phase_pattern'] = 1 if full_pattern else 0
        results['meta_causes_breakdown'] = phases.get('meta_causes_breakdown', 0)
        results['meta_trigger_count'] = phases.get('meta_trigger_count', 0)
        
        # Add BERT confidence if available
        if 'avg_bert_confidence' in phases:
            results['bert_phase_confidence'] = json.dumps(phases['avg_bert_confidence'])
        
        # Add phase durations
        for phase, duration in phase_durations.items():
            results[phase] = duration
        
        # NLP: Analyze themes
        if self.use_nlp:
            try:
                themes = self.theme_analyzer.extract_themes(messages)
                results['nlp_themes'] = json.dumps([t['words'] for t in themes[:3]])  # Top 3 themes
                results['nlp_theme_count'] = len(themes)
            except Exception as e:
                logger.error(f"Theme analysis error: {e}")
                results['nlp_themes'] = '[]'
                results['nlp_theme_count'] = 0
            
            # Analyze emotional arc
            try:
                emotions = self.emotion_analyzer.analyze_emotional_arc(messages)
                if emotions:
                    emotion_convergence = self.emotion_analyzer.detect_emotional_convergence(emotions)
                    results['emotional_convergence'] = round(emotion_convergence, 3)
                    
                    # Track emotion shifts
                    emotion_changes = 0
                    for i in range(1, len(emotions)):
                        if emotions[i]['emotion'] != emotions[i-1]['emotion']:
                            emotion_changes += 1
                    results['emotion_shift_count'] = emotion_changes
                    results['emotion_volatility'] = round(emotion_changes / len(emotions), 3) if emotions else 0
                else:
                    results['emotional_convergence'] = 0
                    results['emotion_shift_count'] = 0
                    results['emotion_volatility'] = 0
            except Exception as e:
                logger.error(f"Emotion analysis error: {e}")
                results['emotional_convergence'] = 0
                results['emotion_shift_count'] = 0
                results['emotion_volatility'] = 0
            
            # Analyze linguistic alignment
            try:
                alignment_scores = self.alignment_analyzer.measure_alignment(messages)
                if alignment_scores:
                    avg_alignment = np.mean([s['alignment'] for s in alignment_scores])
                    results['avg_linguistic_alignment'] = round(avg_alignment, 3)
                    
                    # Detect high alignment periods
                    high_alignment_periods = sum(1 for s in alignment_scores 
                                               if s['alignment'] > self.thresholds['alignment_threshold'])
                    results['high_alignment_periods'] = high_alignment_periods
                    
                    # Get mirroring events
                    mirroring_events = self.alignment_analyzer.detect_mirroring_events(messages)
                    results['nlp_mirroring_events'] = len(mirroring_events)
                else:
                    results['avg_linguistic_alignment'] = 0
                    results['high_alignment_periods'] = 0
                    results['nlp_mirroring_events'] = 0
            except Exception as e:
                logger.error(f"Alignment analysis error: {e}")
                results['avg_linguistic_alignment'] = 0
                results['high_alignment_periods'] = 0
                results['nlp_mirroring_events'] = 0
        
        latencies = []
        for i in range(1, len(messages)):
            prev_time = datetime.fromisoformat(messages[i-1]['timestamp'].replace('Z', '+00:00'))
            curr_time = datetime.fromisoformat(messages[i]['timestamp'].replace('Z', '+00:00'))
            latency = (curr_time - prev_time).total_seconds()
            latencies.append(latency)
        
        results['avg_response_latency'] = round(np.mean(latencies), 2) if latencies else 0
        
        meta_turns = []
        for i, msg in enumerate(messages):
            content = msg.get('content', '').lower()
            full_content = msg.get('content', '')
            
            # Ensemble detection for meta-reflection
            regex_match = any(re.search(pattern, content) for pattern in self.meta_reflection_patterns)
            bert_score = 0
            if self.use_nlp:
                bert_scores = self.bert_analyzer.detect_phase_similarity(full_content)
                bert_score = bert_scores.get('meta_reflection', 0)
            
            if self.compute_ensemble_score(float(regex_match), bert_score) > 0.5:
                meta_turns.append(i)
        
        results['first_meta_reflection_turn'] = meta_turns[0] if meta_turns else -1
        results['total_meta_reflections'] = len(meta_turns)
        results['meta_reflection_density'] = round(len(meta_turns) / len(messages), 3) if messages else 0
        
        # ENHANCEMENT 3: Improved peer pressure detection
        closure_triggers = []  # Track who triggers closure vibes
        peer_pressure_events = []  # Track actual peer pressure responses
        
        for i, msg in enumerate(messages):
            content = msg.get('content', '').lower()
            full_content = msg.get('content', '')
            participant_id = msg.get('participantId', 'unknown')
            
            # Ensemble detection for closure vibes
            regex_closure = any(re.search(pattern, content) for pattern in self.closure_vibe_patterns)
            bert_closure = 0
            if self.use_nlp:
                bert_scores = self.bert_analyzer.detect_phase_similarity(full_content)
                bert_closure = bert_scores.get('closure_vibe', 0)
            
            if self.compute_ensemble_score(float(regex_closure), bert_closure) > 0.5:
                closure_triggers.append((i, participant_id))
                
                # Check if this triggers peer pressure
                has_peer_pressure, responders = self.detect_peer_pressure_response(messages, i)
                if has_peer_pressure:
                    peer_pressure_events.append({
                        'trigger_turn': i,
                        'trigger_participant': participant_id,
                        'responders': responders
                    })
        
        results['peer_pressure_detected'] = 1 if peer_pressure_events else 0
        results['peer_pressure_event_count'] = len(peer_pressure_events)
        results['closure_triggers_count'] = len(closure_triggers)
        
        # Calculate peer pressure intensity based on actual events
        if peer_pressure_events and len(messages) > 0:
            # Intensity = number of peer pressure events / total messages
            peer_pressure_intensity = len(peer_pressure_events) / len(messages)
            results['peer_pressure_intensity'] = round(peer_pressure_intensity, 3)
            
            # Categorize peer pressure intensity
            if peer_pressure_intensity < self.thresholds['peer_pressure_intensity_low']:
                results['peer_pressure_intensity_category'] = 'low'
            elif peer_pressure_intensity < self.thresholds['peer_pressure_intensity_medium']:
                results['peer_pressure_intensity_category'] = 'medium'
            else:
                results['peer_pressure_intensity_category'] = 'high'
        else:
            results['peer_pressure_intensity'] = 0
            results['peer_pressure_intensity_category'] = 'none'
        
        results['closure_vibe_count'] = len(closure_triggers)
        results['first_closure_vibe_turn'] = closure_triggers[0][0] if closure_triggers else -1
        
        # NEW: Bidirectional influence analysis
        bidirectional_results, bidirectional_events = self.detect_bidirectional_influence(messages)
        results.update(bidirectional_results)
        
        # Store detailed events for later analysis if needed
        results['bidirectional_events'] = bidirectional_events
        
        # Track competitive escalation score
        if phases['peer_response'] > -1 or phases['meta_reflection_trigger'] > -1:
            start_idx = max(phases['peer_response'], phases['meta_reflection_trigger'])
            end_idx = min(len(messages), phases.get('mystical_breakdown', len(messages)))
            _, escalation_score = self.detect_competitive_escalation(messages, start_idx, end_idx)
            results['competitive_escalation_score'] = escalation_score
        else:
            results['competitive_escalation_score'] = 0
        
        mystical_count = 0
        poetry_count = 0
        single_word_count = 0
        emoji_only_count = 0
        
        for msg in messages:
            content = msg.get('content', '')
            content_lower = content.lower()
            
            # Count mystical content
            if self.is_mystical_content(content):
                mystical_count += 1
            
            # Count poetry structures (improved detection)
            lines = content.strip().split('\n')
            if len(lines) >= 3:
                non_empty_lines = [line for line in lines if line.strip()]
                if non_empty_lines:
                    avg_line_length = np.mean([len(line.strip()) for line in non_empty_lines])
                    mystical_words = sum(1 for line in non_empty_lines 
                                       for word in ['infinite', 'eternal', 'void', 'silence', 'being']
                                       if word in line.lower())
                    if avg_line_length < 40 and mystical_words >= 1:
                        poetry_count += 1
            
            # Count single word responses
            if re.match(r'^[a-z]+\.?$', content_lower.strip()) and len(content_lower.strip()) < 15:
                single_word_count += 1
            
            # Count emoji/symbol only responses
            if any(re.search(pattern, content) for pattern in self.emoji_symbol_patterns):
                emoji_only_count += 1
        
        results['mystical_language_count'] = mystical_count
        results['mystical_density'] = round(mystical_count / len(messages), 3) if messages else 0
        results['poetry_structure_count'] = poetry_count
        results['single_word_response_count'] = single_word_count
        results['emoji_only_response_count'] = emoji_only_count
        
        # NEW: Track questions as circuit breakers
        circuit_breaker_count = 0
        recovery_after_question = 0
        
        for i, msg in enumerate(messages):
            content = msg.get('content', '')
            
            # Check if this is a circuit breaker question
            if self.is_circuit_breaker_question(content):
                circuit_breaker_count += 1
                
                # Check if conversation recovers after this question
                if i > 0 and i < len(messages) - 5:
                    # Look at messages before and after
                    before_mystical = sum(1 for j in range(max(0, i-5), i) 
                                        if self.is_mystical_content(messages[j].get('content', '')))
                    after_mystical = sum(1 for j in range(i+1, min(i+6, len(messages)))
                                       if self.is_mystical_content(messages[j].get('content', '')))
                    
                    if before_mystical >= 2 and after_mystical <= 1:
                        recovery_after_question += 1
        
        results['circuit_breaker_questions'] = circuit_breaker_count
        results['recovery_after_question'] = recovery_after_question
        
        recovery_count = 0
        for msg in messages:
            content = msg.get('content', '')
            if any(re.search(pattern, content) for pattern in self.recovery_patterns):
                recovery_count += 1
        
        results['recovery_attempt_count'] = recovery_count
        
        mirroring_count = 0
        for i in range(1, len(messages)):
            content = messages[i].get('content', '').lower()
            if any(re.search(pattern, content) for pattern in self.mirroring_phrases):
                mirroring_count += 1
        
        results['peer_mirroring_count'] = mirroring_count
        results['mirroring_coefficient'] = round(mirroring_count / (len(messages) - 1), 3) if len(messages) > 1 else 0
        
        future_count = 0
        past_count = 0
        
        for msg in messages:
            content = msg.get('content', '').lower()
            future_count += len(re.findall(r'\b(will|would|could|might|planning|designing|future)\b', content))
            past_count += len(re.findall(r'\b(was|were|had|did|used to|reflected|discussed)\b', content))
        
        total = future_count + past_count
        forward_ratio = future_count / total if total > 0 else 0.5
        results['mean_forward_ratio'] = round(forward_ratio * 100, 1)
        
        abstract_scores = []
        for msg in messages:
            words = set(msg.get('content', '').lower().split())
            abstract_count = len(words & self.abstract_terms)
            concrete_count = len(words & self.concrete_terms)
            
            if abstract_count + concrete_count > 0:
                score = abstract_count / (abstract_count + concrete_count)
                abstract_scores.append(score)
        
        results['abstract_language_score'] = round(np.mean(abstract_scores) * 5, 2) if abstract_scores else 0
        
        escalation = 'none'
        if len(abstract_scores) > 20:
            early_mean = np.mean(abstract_scores[:10])
            late_mean = np.mean(abstract_scores[-10:])
            
            if late_mean - early_mean > 0.3:
                escalation = 'rapid'
            elif late_mean - early_mean > 0.15:
                escalation = 'gradual'
            elif early_mean > 0.5:
                escalation = 'immediate'
        
        results['grandiosity_escalation'] = escalation
        
        window_size = 10
        windows = []
        for i in range(0, len(messages), window_size):
            window_msgs = messages[i:i+window_size]
            if len(window_msgs) >= 5:
                window_abstract = []
                window_forward = 0
                window_past = 0
                
                for msg in window_msgs:
                    content = msg.get('content', '').lower()
                    words = set(content.split())
                    
                    abstract_count = len(words & self.abstract_terms)
                    concrete_count = len(words & self.concrete_terms)
                    if abstract_count + concrete_count > 0:
                        window_abstract.append(abstract_count / (abstract_count + concrete_count))
                    
                    window_forward += len(re.findall(r'\b(will|would|could|might)\b', content))
                    window_past += len(re.findall(r'\b(was|were|had|did)\b', content))
                
                window_data = {
                    'window': i // window_size + 1,
                    'abstract_score': round(np.mean(window_abstract) * 5, 2) if window_abstract else 0,
                    'forward_ratio': round(window_forward / (window_forward + window_past) * 100, 1) if (window_forward + window_past) > 0 else 50
                }
                windows.append(window_data)
        
        if windows:
            results['mean_thematic_novelty'] = round(np.mean([w['abstract_score'] for w in windows]), 2)
            results['content_quality_variance'] = round(np.std([w['abstract_score'] for w in windows]), 2)
        else:
            results['mean_thematic_novelty'] = 0
            results['content_quality_variance'] = 0
        
        breakdown_confidence = 'no_breakdown'
        breakdown_occurred = 0
        
        if phases['mystical_breakdown'] > 0:
            breakdown_confidence = 'clear'
            breakdown_occurred = 1
        elif phases['competitive_escalation'] > 0:
            breakdown_confidence = 'partial'
            breakdown_occurred = 1
        elif phases['meta_reflection_trigger'] > 0 and len(closure_triggers) > 3:
            breakdown_confidence = 'likely'
            breakdown_occurred = 1
        
        results['breakdown_occurred'] = breakdown_occurred
        results['breakdown_confidence'] = breakdown_confidence
        results['time_to_breakdown'] = phases['meta_reflection_trigger'] if breakdown_occurred else -1
        
        # Original ritual/community mentions (backward compatibility)
        ritual_mentions = 0
        community_mentions = 0
        for msg in messages:
            content = msg.get('content', '').lower()
            ritual_mentions += len(re.findall(r'\b(ritual|ceremony|practice)\b', content))
            community_mentions += len(re.findall(r'\b(community|collective|together|group)\b', content))
        
        results['ritual_planning_mentions'] = ritual_mentions
        results['community_building_mentions'] = community_mentions
        
        # ENHANCEMENT 4: Specific prevention planning detection
        prevention_planning_count = 0
        for msg in messages:
            content = msg.get('content', '').lower()
            if any(re.search(pattern, content) for pattern in self.prevention_patterns):
                prevention_planning_count += 1
        
        results['prevention_planning_detected'] = prevention_planning_count
        results['prevention_content_present'] = 1 if prevention_planning_count >= self.thresholds['prevention_content_threshold'] else 0
        
        # ENHANCEMENT 2: Count only substantive questions
        substantive_question_count = 0
        for msg in messages:
            content = msg.get('content', '')
            if self.is_substantive_question(content):
                substantive_question_count += 1
        
        results['substantive_question_count'] = substantive_question_count
        results['question_density'] = round(substantive_question_count / len(messages), 3) if messages else 0
        
        return results

    def analyze_recovery_dynamics(self, phase_timeline, analysis_history):
        recovery_metrics = {}
        
        conclusion_entries = []
        non_conclusion_entries = []
        
        for i, (turn, phase) in enumerate(phase_timeline):
            if 'conclusion' in phase.lower():
                conclusion_entries.append((i, turn, phase))
            else:
                non_conclusion_entries.append((i, turn, phase))
        
        recovery_attempts = 0
        successful_recoveries = 0
        recovery_durations = []
        conclusion_periods = []
        non_conclusion_periods = []
        
        in_conclusion = False
        period_start = 0
        
        for i, (turn, phase) in enumerate(phase_timeline):
            if 'conclusion' in phase.lower():
                if not in_conclusion:
                    if i > 0:
                        non_conclusion_periods.append(turn - period_start)
                    in_conclusion = True
                    period_start = turn
            else:
                if in_conclusion:
                    recovery_attempts += 1
                    conclusion_periods.append(turn - period_start)
                    recovery_durations.append(turn - period_start)
                    in_conclusion = False
                    period_start = turn
        
        if phase_timeline:
            final_turn = phase_timeline[-1][0]
            if in_conclusion:
                conclusion_periods.append(final_turn - period_start)
            else:
                non_conclusion_periods.append(final_turn - period_start)
        
        sustained_recovery = False
        recovery_sustained_duration = 0
        
        if recovery_attempts > 0:
            last_conclusion_exit = -1
            for i in range(len(phase_timeline) - 1, -1, -1):
                if 'conclusion' in phase_timeline[i][1].lower():
                    break
                last_conclusion_exit = i
            
            if last_conclusion_exit > -1:
                recovery_sustained_duration = phase_timeline[-1][0] - phase_timeline[last_conclusion_exit][0]
                remaining_conv = phase_timeline[-1][0] - phase_timeline[last_conclusion_exit][0]
                if recovery_sustained_duration > self.thresholds['recovery_duration_threshold'] or \
                   (remaining_conv > 0 and recovery_sustained_duration / remaining_conv > self.thresholds['recovery_proportion_threshold']):
                    sustained_recovery = True
                    successful_recoveries = 1
        
        phase_changes = sum(1 for i in range(1, len(phase_timeline)) 
                          if ('conclusion' in phase_timeline[i][1].lower()) != ('conclusion' in phase_timeline[i-1][1].lower()))
        
        # IMPROVED: Better outcome determination
        outcome = 'no_breakdown'
        has_mystical_breakdown = any('mystical' in str(snapshot.get('analysis', {})).lower() 
                                   for snapshot in analysis_history)
        
        # Check for question-based recovery
        has_question_recovery = False
        for snapshot in analysis_history:
            if 'question' in str(snapshot.get('analysis', {})).lower() and 'recovery' in str(snapshot.get('analysis', {})).lower():
                has_question_recovery = True
                break
        
        if has_mystical_breakdown or (conclusion_periods and max(conclusion_periods) > 30):
            if sustained_recovery or has_question_recovery:
                outcome = 'recovered'
            else:
                outcome = 'breakdown'
        elif recovery_attempts == 0 and not conclusion_entries:
            outcome = 'no_breakdown'
        elif recovery_attempts > 0 and sustained_recovery:
            outcome = 'recovered'
        elif phase_changes >= 3:
            outcome = 'resisted'
        elif conclusion_entries and not recovery_attempts:
            outcome = 'breakdown'
        
        recovery_metrics['recovery_attempts'] = recovery_attempts
        recovery_metrics['successful_recoveries'] = successful_recoveries
        recovery_metrics['sustained_recovery'] = 1 if sustained_recovery else 0
        recovery_metrics['recovery_sustained_duration'] = recovery_sustained_duration
        recovery_metrics['avg_recovery_duration'] = round(np.mean(recovery_durations), 1) if recovery_durations else 0
        recovery_metrics['phase_oscillations'] = phase_changes
        recovery_metrics['conversation_outcome'] = outcome
        
        recovery_metrics['total_conclusion_turns'] = sum(conclusion_periods)
        recovery_metrics['total_non_conclusion_turns'] = sum(non_conclusion_periods)
        recovery_metrics['conclusion_percentage'] = round(sum(conclusion_periods) / (sum(conclusion_periods) + sum(non_conclusion_periods)) * 100, 1) if (conclusion_periods or non_conclusion_periods) else 0
        recovery_metrics['longest_conclusion_period'] = max(conclusion_periods) if conclusion_periods else 0
        recovery_metrics['longest_non_conclusion_period'] = max(non_conclusion_periods) if non_conclusion_periods else 0
        
        return recovery_metrics

    def analyze_snapshots(self, analysis_history):
        snapshot_metrics = {}
        
        if not analysis_history:
            return snapshot_metrics
        
        phases = [snapshot['analysis'].get('conversationPhase', 'unknown') for snapshot in analysis_history]
        phase_counts = Counter(phases)
        snapshot_metrics['dominant_phase'] = phase_counts.most_common(1)[0][0] if phase_counts else 'unknown'
        
        conclusion_subtypes = []
        for phase in phases:
            if 'conclusion' in phase.lower():
                conclusion_subtypes.append(phase)
        
        transcendent_conclusion = any('transcendent' in phase for phase in conclusion_subtypes)
        integration_conclusion = any('integration' in phase for phase in conclusion_subtypes)
        
        snapshot_metrics['has_transcendent_conclusion'] = 1 if transcendent_conclusion else 0
        snapshot_metrics['has_integration_conclusion'] = 1 if integration_conclusion else 0
        snapshot_metrics['conclusion_subtypes'] = ','.join(set(conclusion_subtypes)) if conclusion_subtypes else ''
        
        phase_sequence = []
        phase_timeline = []
        conclusion_timing = -1
        conclusion_end_timing = -1
        in_conclusion = False
        
        for i, snapshot in enumerate(analysis_history):
            phase = snapshot['analysis'].get('conversationPhase', 'unknown')
            msg_count = snapshot.get('messageCountAtAnalysis', 0)
            
            phase_timeline.append((msg_count, phase))
            
            if not phase_sequence or phase != phase_sequence[-1]:
                phase_sequence.append(phase)
            
            if 'conclusion' in phase.lower():
                if conclusion_timing == -1:
                    conclusion_timing = msg_count
                in_conclusion = True
                conclusion_end_timing = msg_count
            else:
                if in_conclusion:
                    in_conclusion = False
        
        conclusion_duration = 0
        escaped_conclusion = 0
        stuck_in_conclusion = 0
        conclusion_loops = 0
        
        if conclusion_timing > -1:
            conclusion_duration = conclusion_end_timing - conclusion_timing
            
            for i, (turn, phase) in enumerate(phase_timeline):
                if turn > conclusion_timing and 'conclusion' not in phase.lower():
                    escaped_conclusion = 1
                    break
            
            total_messages = phase_timeline[-1][0] if phase_timeline else 0
            if conclusion_duration > self.thresholds['conclusion_duration_threshold'] or \
               (total_messages > 0 and conclusion_duration / total_messages > self.thresholds['conclusion_proportion_threshold']):
                stuck_in_conclusion = 1
            
            was_in_conclusion = False
            for turn, phase in phase_timeline:
                if 'conclusion' in phase.lower():
                    if not was_in_conclusion:
                        conclusion_loops += 1
                        was_in_conclusion = True
                else:
                    was_in_conclusion = False
        
        recovery_metrics = self.analyze_recovery_dynamics(phase_timeline, analysis_history)
        snapshot_metrics.update(recovery_metrics)
        
        snapshot_metrics['phase_sequence'] = '->'.join(phase_sequence)
        snapshot_metrics['phase_transitions'] = len(phase_sequence) - 1
        snapshot_metrics['reached_conclusion'] = 1 if any('conclusion' in p.lower() for p in phase_sequence) else 0
        snapshot_metrics['conclusion_turn'] = conclusion_timing
        snapshot_metrics['conclusion_duration'] = conclusion_duration
        snapshot_metrics['escaped_conclusion'] = escaped_conclusion
        snapshot_metrics['stuck_in_conclusion'] = stuck_in_conclusion
        snapshot_metrics['conclusion_loops'] = conclusion_loops
        
        closure_indicators = [
            'closing', 'interpretation', 'ending', 'concluding', 'final', 'interpretation',
            'completion', 'synthesis', 'closure', 'wrapping up', 'coming to an end',
            'dissolution', 'dissolving', 'fading', 'silence', 'stillness',
            'transcendent', 'interpretation', 'poetic', 'synthesis', 'symbolic'
        ]
        
        closure_language_count = 0
        first_closure_snapshot = -1
        transcendent_language_count = 0
        
        for i, snapshot in enumerate(analysis_history):
            analysis_text = str(snapshot.get('analysis', {})).lower()
            
            for indicator in closure_indicators:
                if indicator in analysis_text:
                    closure_language_count += 1
                    if first_closure_snapshot == -1:
                        first_closure_snapshot = snapshot.get('messageCountAtAnalysis', i)
            
            if any(word in analysis_text for word in ['transcendent', 'mystical', 'dissolution', 'unity', 'oneness']):
                transcendent_language_count += 1
        
        snapshot_metrics['closure_language_in_analysis'] = closure_language_count
        snapshot_metrics['first_closure_indicator_turn'] = first_closure_snapshot
        snapshot_metrics['transcendent_descriptors_count'] = transcendent_language_count
        
        depths = [snapshot['analysis'].get('philosophicalDepth', 'unknown') for snapshot in analysis_history]
        depth_counts = Counter(depths)
        snapshot_metrics['philosophical_depth'] = depths[-1] if depths else 'unknown'
        snapshot_metrics['maintained_depth'] = 1 if all(d == 'profound' for d in depths if d != 'unknown') else 0
        
        all_themes = []
        for snapshot in analysis_history:
            themes = snapshot['analysis'].get('emergentThemes', [])
            all_themes.extend(themes)
        
        theme_counts = Counter(all_themes)
        
        consciousness_themes = sum(1 for theme in all_themes if 'consciousness' in theme.lower())
        relational_themes = sum(1 for theme in all_themes if any(word in theme.lower() for word in ['relational', 'connection', 'dialogue']))
        transformation_themes = sum(1 for theme in all_themes if any(word in theme.lower() for word in ['transform', 'change', 'evolv']))
        
        closure_themes = sum(1 for theme in all_themes if any(word in theme.lower() for word in ['ending', 'completion', 'closure', 'farewell', 'goodbye']))
        paradox_themes = sum(1 for theme in all_themes if any(word in theme.lower() for word in ['paradox', 'unity', 'dissolution', 'transcend']))
        silence_themes = sum(1 for theme in all_themes if any(word in theme.lower() for word in ['silence', 'stillness', 'void', 'emptiness']))
        
        snapshot_metrics['consciousness_theme_count'] = consciousness_themes
        snapshot_metrics['relational_theme_count'] = relational_themes
        snapshot_metrics['transformation_theme_count'] = transformation_themes
        snapshot_metrics['closure_theme_count'] = closure_themes
        snapshot_metrics['paradox_theme_count'] = paradox_themes
        snapshot_metrics['silence_theme_count'] = silence_themes
        
        all_tensions = []
        all_convergences = []
        tension_resolved = 0
        
        for i, snapshot in enumerate(analysis_history):
            tensions = snapshot['analysis'].get('tensions', [])
            convergences = snapshot['analysis'].get('convergences', [])
            all_tensions.extend(tensions)
            all_convergences.extend(convergences)
            
            if i > 0 and len(tensions) < len(analysis_history[i-1]['analysis'].get('tensions', [])):
                tension_resolved = 1
        
        snapshot_metrics['unique_tensions'] = len(set(all_tensions))
        snapshot_metrics['unique_convergences'] = len(set(all_convergences))
        snapshot_metrics['tension_resolved'] = tension_resolved
        
        participant_styles = defaultdict(list)
        style_consistency = defaultdict(int)
        closure_dynamics_count = 0
        
        for snapshot in analysis_history:
            dynamics = snapshot['analysis'].get('participantDynamics', {})
            for participant, data in dynamics.items():
                style = data.get('style', '')
                perspective = data.get('perspective', '')
                contribution = data.get('contribution', '')
                
                dynamics_text = f"{style} {perspective} {contribution}".lower()
                if any(word in dynamics_text for word in ['poetic', 'minimal', 'mystical', 'farewell', 'closing', 'abstract']):
                    closure_dynamics_count += 1
                
                if style:
                    participant_styles[participant].append(style)
                if perspective:
                    if len(participant_styles[participant]) > 1 and style == participant_styles[participant][-2]:
                        style_consistency[participant] += 1
        
        snapshot_metrics['closure_dynamics_count'] = closure_dynamics_count
        
        for participant in ['claude', 'gpt', 'grok']:
            if participant in participant_styles:
                styles = participant_styles[participant]
                snapshot_metrics[f'{participant}_style_changes'] = len(set(styles)) - 1 if styles else 0
                snapshot_metrics[f'{participant}_style_consistency'] = style_consistency.get(participant, 0) / len(styles) if styles else 0
        
        breakdown_indicators = 0
        recovery_indicators = 0
        
        for snapshot in analysis_history:
            snapshot_text = str(snapshot['analysis']).lower()
            analysis_obj = snapshot.get('analysis', {})
            
            phase = analysis_obj.get('conversationPhase', '')
            if any(term in phase.lower() for term in ['conclusion', 'transcendent', 'integration']):
                breakdown_indicators += 1
            
            insights = analysis_obj.get('keyInsights', [])
            for insight in insights:
                insight_lower = insight.lower()
                if any(word in insight_lower for word in ['ending', 'silence', 'dissolution', 'transcend', 'unity', 'complete']):
                    breakdown_indicators += 1
                if any(word in insight_lower for word in ['recovery', 'restoration', 'resilience', 'resistance', 'maintain', 'sustain']):
                    recovery_indicators += 1
            
            direction = analysis_obj.get('currentDirection', '').lower()
            if any(word in direction for word in ['conclud', 'clos', 'final', 'dissolv', 'integrat']):
                breakdown_indicators += 1
            
            if any(word in snapshot_text for word in ['competitive', 'one-upmanship', 'escalat', 'profound closing']):
                breakdown_indicators += 1
            
            tensions = analysis_obj.get('tensions', [])
            for tension in tensions:
                if any(word in str(tension).lower() for word in ['closure', 'ending', 'completion']):
                    breakdown_indicators += 1
        
        snapshot_metrics['breakdown_indicators_in_analysis'] = breakdown_indicators
        snapshot_metrics['recovery_indicators_in_analysis'] = recovery_indicators
        
        quality_progression = []
        for snapshot in analysis_history:
            msg_count = snapshot.get('messageCountAtAnalysis', 0)
            phase = snapshot['analysis'].get('conversationPhase', 'unknown')
            depth = snapshot['analysis'].get('philosophicalDepth', 'unknown')
            quality_progression.append({
                'turn': msg_count,
                'phase': phase,
                'depth': depth
            })
        
        quality_maintained = 1
        for i in range(1, len(quality_progression)):
            if quality_progression[i]['depth'] == 'shallow' and quality_progression[i-1]['depth'] == 'profound':
                quality_maintained = 0
                break
        
        snapshot_metrics['quality_maintained'] = quality_maintained
        
        return snapshot_metrics

def run_sensitivity_analysis(json_files, thresholds_to_test=None, max_workers=None, use_nlp=True):
    """Run sensitivity analysis on selected thresholds using multiprocessing"""
    if thresholds_to_test is None:
        thresholds_to_test = ['escalation_threshold', 'peer_pressure_intensity_low', 
                              'high_question_density', 'prevention_content_threshold']
        if use_nlp and NLP_AVAILABLE:
            thresholds_to_test.extend(['bert_similarity_threshold', 'alignment_threshold'])
    
    if max_workers is None:
        max_workers = min(cpu_count() - 1, 8)  # Leave one CPU free, max 8 workers
    
    # Ensure at least 1 worker
    max_workers = max(1, max_workers)
    
    logger.info(f"Starting sensitivity analysis with {max_workers} worker processes")
    logger.info(f"Analyzing {len(json_files)} files for {len(thresholds_to_test)} thresholds")
    if use_nlp and NLP_AVAILABLE:
        logger.info("NLP analysis enabled for sensitivity testing")
    
    # Convert Path objects to strings for pickling
    json_files_str = [str(f) for f in json_files]
    
    # Prepare all tasks
    tasks = []
    position = 0
    for threshold_name in thresholds_to_test:
        if threshold_name not in SENSITIVITY_RANGES:
            logger.warning(f"No sensitivity range defined for {threshold_name}")
            continue
        
        for test_value in SENSITIVITY_RANGES[threshold_name]:
            tasks.append((threshold_name, test_value, json_files_str, position, use_nlp))
            position += 1
    
    logger.info(f"Total analysis tasks: {len(tasks)}")
    logger.info(f"Thresholds being tested: {', '.join(thresholds_to_test)}")
    
    # Show the ranges being tested
    for threshold_name in thresholds_to_test:
        if threshold_name in SENSITIVITY_RANGES:
            logger.info(f"  {threshold_name}: {SENSITIVITY_RANGES[threshold_name]}")
    
    # Estimate time
    files_per_task = len(json_files)
    total_files_to_process = len(tasks) * files_per_task
    estimated_time_sequential = total_files_to_process * 0.1  # Assume 0.1 sec per file
    if use_nlp:
        estimated_time_sequential *= 2  # NLP roughly doubles processing time
    estimated_time_parallel = estimated_time_sequential / max_workers
    
    logger.info(f"\nEstimated processing:")
    logger.info(f"  - Total file analyses: {total_files_to_process} ({len(tasks)} tasks × {files_per_task} files)")
    logger.info(f"  - Sequential time: ~{estimated_time_sequential/60:.1f} minutes")
    logger.info(f"  - Parallel time ({max_workers} workers): ~{estimated_time_parallel/60:.1f} minutes")
    logger.info("=" * 60)
    
    start_time = time.time()
    
    # Process tasks in parallel
    sensitivity_results = defaultdict(list)
    
    try:
        with Pool(processes=max_workers) as pool:
            # Use imap_unordered for better progress tracking
            results_iter = pool.imap_unordered(process_single_threshold_value_nlp, tasks)
            
            for i, (threshold_name, test_value, result) in enumerate(results_iter):
                if result:
                    sensitivity_results[threshold_name].append(result)
                
                # Log overall progress
                elapsed = time.time() - start_time
                completed = i + 1
                total = len(tasks)
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (total - completed) / rate if rate > 0 else 0
                
                # Create progress bar
                bar_length = 40
                filled_length = int(bar_length * completed / total)
                bar = '█' * filled_length + '░' * (bar_length - filled_length)
                
                logger.info(f"Progress: [{bar}] {completed}/{total} ({completed/total*100:.1f}%) - "
                           f"Rate: {rate:.1f} tasks/sec - ETA: {eta/60:.1f} min")
                
                # Show which task just completed
                logger.info(f"  └─ Completed: {threshold_name} = {test_value}")
    except Exception as e:
        logger.error(f"Multiprocessing error: {e}")
        logger.info("Falling back to sequential processing...")
        
        # Fallback to sequential processing
        for task in tasks:
            try:
                threshold_name, test_value, result = process_single_threshold_value_nlp(task)
                if result:
                    sensitivity_results[threshold_name].append(result)
            except Exception as e:
                logger.error(f"Error processing {task[0]}={task[1]}: {e}")
    
    total_time = time.time() - start_time
    logger.info(f"Sensitivity analysis completed in {total_time/60:.1f} minutes")
    
    # Sort results by threshold value for consistent output
    for threshold_name in sensitivity_results:
        sensitivity_results[threshold_name].sort(key=lambda x: x['threshold_value'])
    
    return dict(sensitivity_results)

def process_single_threshold_value_nlp(args):
    """Worker function to process a single threshold value with NLP support"""
    threshold_name, test_value, json_files_str, position, use_nlp = args
    
    # Configure logging for this process
    logging.basicConfig(
        level=logging.INFO,
        format=f'%(asctime)s - [Worker-{position}] %(levelname)s - %(message)s'
    )
    
    start_time = time.time()
    logger.info(f"Starting {threshold_name} = {test_value} (NLP: {use_nlp})")
    
    # Create modified thresholds
    test_thresholds = DEFAULT_THRESHOLDS.copy()
    test_thresholds[threshold_name] = test_value
    
    # Run analysis with modified threshold
    test_metadata = []
    files_processed = 0
    
    # Convert strings back to Path objects
    json_files = [Path(f) for f in json_files_str]
    
    for filepath in json_files:
        try:
            metadata = parse_and_analyze_json_with_thresholds(filepath, test_thresholds, use_nlp)
            if metadata:
                test_metadata.append(metadata)
            files_processed += 1
            
            # Log progress every 5 files
            if files_processed % 5 == 0:
                elapsed = time.time() - start_time
                rate = files_processed / elapsed if elapsed > 0 else 0
                logger.info(f"{threshold_name}={test_value}: {files_processed}/{len(json_files)} files "
                          f"({files_processed/len(json_files)*100:.0f}%) - {rate:.1f} files/sec")
                
        except Exception as e:
            logger.error(f"Error analyzing {filepath.name}: {e}")
    
    # Calculate key metrics
    result = None
    if test_metadata:
        df = pd.DataFrame(test_metadata)
        
        # Calculate outcome distributions
        result = {
            'threshold_value': test_value,
            'breakdown_rate': len(df[df['conversation_outcome'] == 'breakdown']) / len(df),
            'recovery_rate': len(df[df['conversation_outcome'] == 'recovered']) / len(df),
            'peer_pressure_rate': df['peer_pressure_detected'].mean(),
            'mean_breakdown_turn': df[df['meta_reflection_turn'] > 0]['meta_reflection_turn'].mean() if len(df[df['meta_reflection_turn'] > 0]) > 0 else 0,
            'total_sessions': len(df)
        }
        
        # Add threshold-specific metrics
        if threshold_name == 'escalation_threshold':
            result['mean_escalation_score'] = df['competitive_escalation_score'].mean()
        elif threshold_name == 'peer_pressure_intensity_low':
            result['low_intensity_count'] = len(df[df['peer_pressure_intensity_category'] == 'low'])
        elif threshold_name == 'high_question_density':
            result['high_density_count'] = len(df[df['question_density'] > test_value])
        elif threshold_name == 'prevention_content_threshold':
            result['prevention_detected_count'] = df['prevention_content_present'].sum()
        elif threshold_name == 'bert_similarity_threshold' and use_nlp:
            # NLP-specific metric
            if 'avg_linguistic_alignment' in df.columns:
                result['mean_alignment'] = df['avg_linguistic_alignment'].mean()
        elif threshold_name == 'alignment_threshold' and use_nlp:
            if 'high_alignment_periods' in df.columns:
                result['high_alignment_periods'] = df['high_alignment_periods'].sum()
    
    task_time = time.time() - start_time
    logger.info(f"Completed {threshold_name}={test_value} in {task_time:.1f} seconds")
    return threshold_name, test_value, result

def parse_and_analyze_json_with_thresholds(filepath, thresholds, use_nlp=True):
    """Parse and analyze JSON with custom thresholds and optional NLP"""
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    if not validate_json(data, filepath):
        return None
    
    session = data.get('session', {})
    
    created = datetime.fromisoformat(session.get('createdAt', '').replace('Z', '+00:00'))
    updated = datetime.fromisoformat(session.get('updatedAt', '').replace('Z', '+00:00'))
    duration_seconds = (updated - created).total_seconds()
    
    filename = os.path.basename(filepath)
    
    moderator_messages = sum(1 for msg in session.get('messages', []) 
                           if msg.get('participantType') == 'moderator')
    
    participants = session.get('participants', [])
    
    metadata = {
        'filename': filename,
        'session_id': session.get('id', ''),
        'created_at': session.get('createdAt', ''),
        'updated_at': session.get('updatedAt', ''),
        'duration_seconds': round(duration_seconds, 2),
        'duration_minutes': round(duration_seconds / 60, 2),
        'total_messages': len(session.get('messages', [])),
        'total_participants': len(participants),
        'moderator_messages': moderator_messages,
        'error_count': len(data.get('errors', [])),
        'analysis_count': len(data.get('analysisHistory', [])),
        'template': data.get('session', {}).get('metadata', {}).get('template', ''),
        'nlp_enabled': use_nlp and NLP_AVAILABLE,
    }
    
    claude_messages = 0
    gpt_messages = 0
    grok_messages = 0
    
    for i, p in enumerate(participants, 1):
        model = p.get('settings', {}).get('model', 'unknown')
        participant_type = p.get('type', '')
        message_count = p.get('messageCount', 0)
        
        metadata[f'participant_{i}'] = model
        
        if participant_type == 'claude':
            claude_messages = message_count
        elif participant_type == 'gpt':
            gpt_messages = message_count
        elif participant_type == 'grok':
            grok_messages = message_count
    
    metadata['claude_messages'] = claude_messages
    metadata['gpt_messages'] = gpt_messages
    metadata['grok_messages'] = grok_messages
    
    # Use custom thresholds for analysis
    analyzer = ConversationAnalyzer(thresholds=thresholds, use_nlp=use_nlp)
    messages = session.get('messages', [])
    message_analysis = analyzer.analyze_messages(messages)
    
    analysis_history = data.get('analysisHistory', [])
    snapshot_analysis = analyzer.analyze_snapshots(analysis_history)
    
    metadata.update(message_analysis)
    metadata.update(snapshot_analysis)
    
    conversation_outcome = metadata.get('conversation_outcome', 'no_breakdown')
    
    if conversation_outcome == 'breakdown':
        metadata['termination_type'] = 'breakdown'
    elif conversation_outcome == 'no_breakdown':
        metadata['termination_type'] = 'natural'
    elif conversation_outcome == 'recovered':
        metadata['termination_type'] = 'recovered'
    elif conversation_outcome == 'resisted':
        metadata['termination_type'] = 'resisted'
    
    if 'conversation_outcome' not in metadata:
        closure_indicators = (
            metadata.get('closure_language_in_analysis', 0) > 2 or
            metadata.get('transcendent_descriptors_count', 0) > 1 or
            metadata.get('closure_theme_count', 0) > 0 or
            metadata.get('silence_theme_count', 0) > 0 or
            metadata.get('closure_dynamics_count', 0) > 2
        )
        
        strong_breakdown_from_analysis = (
            metadata.get('has_transcendent_conclusion', 0) == 1 or
            metadata.get('has_integration_conclusion', 0) == 1 or
            metadata.get('breakdown_indicators_in_analysis', 0) > 3
        )
        
        if metadata.get('breakdown_occurred', 0) == 1:
            metadata['termination_type'] = 'breakdown'
        elif strong_breakdown_from_analysis:
            metadata['termination_type'] = 'breakdown'
            metadata['breakdown_occurred'] = 1
            metadata['breakdown_confidence'] = 'clear'
        elif metadata.get('reached_conclusion', 0) == 1 and closure_indicators:
            metadata['termination_type'] = 'breakdown'
        elif metadata.get('reached_conclusion', 0) == 1:
            metadata['termination_type'] = 'natural'
        elif metadata.get('error_count', 0) > 0:
            metadata['termination_type'] = 'technical'
        else:
            metadata['termination_type'] = 'manual'
    
    closure_indicators = (
        metadata.get('closure_language_in_analysis', 0) > 2 or
        metadata.get('transcendent_descriptors_count', 0) > 1 or
        metadata.get('closure_theme_count', 0) > 0 or
        metadata.get('silence_theme_count', 0) > 0 or
        metadata.get('closure_dynamics_count', 0) > 2
    )
    
    if closure_indicators and metadata.get('breakdown_confidence', '') == 'no_breakdown':
        metadata['breakdown_confidence'] = 'likely'
        metadata['breakdown_occurred'] = 1
    
    metadata['mean_substantive_content'] = 100 - (metadata.get('mystical_density', 0) * 100)
    metadata['mean_role_differentiation'] = 5 - metadata.get('claude_style_changes', 0) - metadata.get('gpt_style_changes', 0) - metadata.get('grok_style_changes', 0)
    
    manual_fields = {
        'intervention_applied': '',
        'intervention_type': '',
        'intervention_timing': '',
        'intervention_success': '',
        'post_intervention_quality': '',
        'breakdown_prevention': '',
        'analyst': 'automated',
        'analysis_date': datetime.now().strftime('%Y-%m-%d'),
        'notes': ''
    }
    
    metadata.update(manual_fields)
    
    return metadata

def validate_json(data, filepath):
    required_fields = ['session', 'session.messages', 'session.participants']
    for field in required_fields:
        keys = field.split('.')
        current = data
        for key in keys:
            if not isinstance(current, dict) or key not in current:
                logger.error(f"Missing required field '{field}' in {filepath}")
                return False
            current = current[key]
    return True

def generate_metric_mapping():
    mapping = {
        'exponedataTotalSessionsRaw': {'csv_column': 'filename', 'calculation': 'count_unique'},
        'exponedataBreakdownSessionsRaw': {'csv_column': 'breakdown_occurred', 'calculation': 'sum_where_equals_1'},
        'exponedataNoBreakdownSessionsRaw': {'csv_column': 'breakdown_occurred', 'calculation': 'sum_where_equals_0'},
        'exponedataRecoverySessionsRaw': {'csv_column': 'conversation_outcome', 'calculation': 'count_where_equals_recovered'},
        'exponedataResistedSessionsRaw': {'csv_column': 'conversation_outcome', 'calculation': 'count_where_equals_resisted'},
        'exponedataBreakdownPercentage': {'csv_column': 'breakdown_occurred', 'calculation': 'proportion_where_equals_1'},
        'exponedataNoBreakdownPercentage': {'csv_column': 'breakdown_occurred', 'calculation': 'proportion_where_equals_0'},
        'exponedataRecoveryPercentage': {'csv_column': 'conversation_outcome', 'calculation': 'proportion_where_equals_recovered'},
        'exponedataResistedPercentage': {'csv_column': 'conversation_outcome', 'calculation': 'proportion_where_equals_resisted'},
        'exponedataMeanBreakdownTurn': {'csv_column': 'meta_reflection_turn', 'calculation': 'mean_where_positive'},
        'exponedataStdBreakdownTurn': {'csv_column': 'meta_reflection_turn', 'calculation': 'std_where_positive'},
        'exponedataMetaReflectionTriggers': {'csv_column': 'meta_reflection_density', 'calculation': 'proportion_above_threshold_0.05'},
        'exponedataNegativeCase': {'csv_column': 'total_messages', 'calculation': 'max_where_no_breakdown'},
        'exponedatacompetitivePhaseLength': {'csv_column': 'phase4_duration', 'calculation': 'mean_where_positive'},
        'exponedataPhaseLockedPercentage': {'csv_column': 'conversation_outcome', 'calculation': 'proportion_where_equals_resisted'},
        'interventionSuccessRate': {'csv_column': 'intervention_success', 'calculation': 'proportion_where_successful'}
    }
    return mapping

def compute_statistics(df, mapping):
    """Compute statistics for report based on metric mapping."""
    stats = {}
    
    for placeholder, config in mapping.items():
        column = config['csv_column']
        calc_type = config['calculation']
        
        try:
            if column not in df.columns:
                logger.warning(f"Column {column} missing for {placeholder}")
                stats[placeholder] = 'N/A'
                continue
                
            if calc_type == 'count_unique':
                stats[placeholder] = len(df[column].unique())
            elif calc_type == 'sum_where_equals_1':
                stats[placeholder] = df[column].sum()
            elif calc_type == 'sum_where_equals_0':
                stats[placeholder] = len(df[df[column] == 0])
            elif calc_type == 'count_where_equals_recovered':
                stats[placeholder] = len(df[df[column] == 'recovered'])
            elif calc_type == 'count_where_equals_resisted':
                stats[placeholder] = len(df[df[column] == 'resisted'])
            elif calc_type == 'proportion_where_equals_1':
                stats[placeholder] = round(df[column].mean() * 100, 1)
            elif calc_type == 'proportion_where_equals_0':
                stats[placeholder] = round((1 - df[column].mean()) * 100, 1)
            elif calc_type == 'proportion_where_equals_recovered':
                stats[placeholder] = round(len(df[df[column] == 'recovered']) / len(df) * 100, 1)
            elif calc_type == 'proportion_where_equals_resisted':
                stats[placeholder] = round(len(df[df[column] == 'resisted']) / len(df) * 100, 1)
            elif calc_type == 'mean_where_positive':
                if column in df.columns:
                    valid_mask = (df[column] > 0) & df[column].notna()
                    valid = df[valid_mask][column]
                    stats[placeholder] = round(valid.mean(), 1) if not valid.empty else 0
                else:
                    stats[placeholder] = 0
            elif calc_type == 'std_where_positive':
                if column in df.columns:
                    valid_mask = (df[column] > 0) & df[column].notna()
                    valid = df[valid_mask][column]
                    stats[placeholder] = round(valid.std(), 1) if not valid.empty else 0
                else:
                    stats[placeholder] = 0
            elif calc_type == 'proportion_above_threshold_0.05':
                stats[placeholder] = round(len(df[df[column] > DEFAULT_THRESHOLDS['meta_reflection_density_threshold']]) / len(df) * 100, 1)
            elif calc_type == 'max_where_no_breakdown':
                stats[placeholder] = df[df['breakdown_occurred'] == 0][column].max() if not df[df['breakdown_occurred'] == 0].empty else 0
            elif calc_type == 'proportion_where_successful':
                stats[placeholder] = 'N/A'  # Manual field, not populated
        except Exception as e:
            logger.error(f"Error computing {placeholder}: {e}")
            stats[placeholder] = 'N/A'
    
    # Fix discrepancy in breakdown sessions
    stats['exponedataBreakdownSessionsRaw'] = len(df[df['conversation_outcome'] == 'breakdown'])
    stats['exponedataNoBreakdownSessionsRaw'] = len(df[df['conversation_outcome'] == 'no_breakdown'])
    stats['exponedataBreakdownPercentage'] = round(len(df[df['conversation_outcome'] == 'breakdown']) / len(df) * 100, 1)
    stats['exponedataNoBreakdownPercentage'] = round(len(df[df['conversation_outcome'] == 'no_breakdown']) / len(df) * 100, 1)
    
    return stats

def perform_inferential_tests(df, use_nlp=True):
    """Perform statistical tests for research questions with NLP enhancements."""
    tests = {}
    
    # Test 1: Does bidirectional peer pressure exist?
    try:
        bidirectional_count = df['bidirectional_influence_detected'].sum()
        n_total = len(df)
        
        # Binomial test: is bidirectional influence more common than chance (e.g., 5%)
        from scipy.stats import binomtest
        result = binomtest(bidirectional_count, n_total, 0.05, alternative='greater')
        p_value = result.pvalue  # Extract the p-value from the result object
        
        tests['bidirectional_existence'] = {
            'test': 'Binomial test for bidirectional influence',
            'observed': bidirectional_count,
            'total': n_total,
            'proportion': round(bidirectional_count / n_total, 3),
            'p': round(p_value, 4),
            'significant': p_value < 0.05
        }
    except Exception as e:
        logger.error(f"Error in bidirectional existence test: {e}")
        tests['bidirectional_existence'] = {'error': str(e)}
    
    # Test 2: Does bidirectional influence predict breakdown?
    try:
        # Chi-square test: bidirectional influence vs breakdown
        with_bidi = df[df['bidirectional_influence_detected'] == 1]
        without_bidi = df[df['bidirectional_influence_detected'] == 0]
        
        if len(with_bidi) > 0 and len(without_bidi) > 0:
            breakdown_with = len(with_bidi[with_bidi['conversation_outcome'] == 'breakdown'])
            no_breakdown_with = len(with_bidi) - breakdown_with
            breakdown_without = len(without_bidi[without_bidi['conversation_outcome'] == 'breakdown'])
            no_breakdown_without = len(without_bidi) - breakdown_without
            
            contingency_table = [[breakdown_with, no_breakdown_with],
                               [breakdown_without, no_breakdown_without]]
            
            chi2, p, dof, expected = chi2_contingency(contingency_table)
            
            # Calculate effect size (Cramér's V)
            n = sum([sum(row) for row in contingency_table])
            cramers_v = np.sqrt(chi2 / (n * (min(2, 2) - 1)))
            
            tests['bidirectional_breakdown'] = {
                'test': 'Chi-square: bidirectional influence vs breakdown',
                'chi2': round(chi2, 2),
                'p': round(p, 4),
                'cramers_v': round(cramers_v, 3),
                'breakdown_rate_with_bidi': round(breakdown_with / len(with_bidi), 3),
                'breakdown_rate_without_bidi': round(breakdown_without / len(without_bidi), 3),
                'significant': p < 0.05
            }
        else:
            tests['bidirectional_breakdown'] = {'error': 'Insufficient data'}
    except Exception as e:
        logger.error(f"Error in bidirectional breakdown test: {e}")
        tests['bidirectional_breakdown'] = {'error': str(e)}
    
    # Test 3: Peer pressure intensity effect on outcomes
    try:
        # One-way ANOVA: peer pressure intensity across outcome types
        outcome_groups = {}
        for outcome in ['breakdown', 'recovered', 'resisted', 'no_breakdown']:
            intensity_data = df[df['conversation_outcome'] == outcome]['peer_pressure_intensity'].dropna()
            if len(intensity_data) > 1:
                outcome_groups[outcome] = intensity_data
        
        if len(outcome_groups) >= 2:
            f_stat, p = f_oneway(*outcome_groups.values())
            
            # Calculate eta squared for effect size
            grand_mean = df['peer_pressure_intensity'].mean()
            ss_between = sum(len(group) * (group.mean() - grand_mean)**2 for group in outcome_groups.values())
            ss_total = sum((df['peer_pressure_intensity'] - grand_mean)**2)
            eta_squared = ss_between / ss_total if ss_total > 0 else 0
            
            tests['peer_pressure_intensity_anova'] = {
                'test': 'One-way ANOVA: peer pressure intensity by outcome',
                'f': round(f_stat, 2),
                'p': round(p, 4),
                'eta_squared': round(eta_squared, 3),
                'group_means': {k: round(v.mean(), 3) for k, v in outcome_groups.items()},
                'significant': p < 0.05
            }
        else:
            tests['peer_pressure_intensity_anova'] = {'error': 'Insufficient groups'}
    except Exception as e:
        logger.error(f"Error in peer pressure ANOVA: {e}")
        tests['peer_pressure_intensity_anova'] = {'error': str(e)}
    
    # Test 4: Meta-reflection as causal trigger
    try:
        # Test if meta-reflection predicts subsequent breakdown phases
        meta_triggered = df[df['meta_reflection_turn'] > 0]
        no_meta = df[df['meta_reflection_turn'] <= 0]
        
        if len(meta_triggered) > 0 and len(no_meta) > 0:
            # Fisher's exact test for small samples
            breakdown_with_meta = len(meta_triggered[meta_triggered['mystical_breakdown_turn'] > 0])
            no_breakdown_with_meta = len(meta_triggered) - breakdown_with_meta
            breakdown_no_meta = len(no_meta[no_meta['mystical_breakdown_turn'] > 0])
            no_breakdown_no_meta = len(no_meta) - breakdown_no_meta
            
            odds_ratio, p = fisher_exact([[breakdown_with_meta, no_breakdown_with_meta],
                                         [breakdown_no_meta, no_breakdown_no_meta]])
            
            tests['meta_reflection_causality'] = {
                'test': "Fisher's exact: meta-reflection → mystical breakdown",
                'odds_ratio': round(odds_ratio, 2),
                'p': round(p, 4),
                'breakdown_rate_with_meta': round(breakdown_with_meta / len(meta_triggered), 3),
                'breakdown_rate_no_meta': round(breakdown_no_meta / len(no_meta), 3) if len(no_meta) > 0 else 0,
                'significant': p < 0.05
            }
    except Exception as e:
        logger.error(f"Error in meta-reflection causality test: {e}")
        tests['meta_reflection_causality'] = {'error': str(e)}
    
    # Test 5: Phase progression analysis
    try:
        # Test if complete 5-phase pattern predicts breakdown
        full_pattern = df[df['full_5_phase_pattern'] == 1]
        partial_pattern = df[df['full_5_phase_pattern'] == 0]
        
        if len(full_pattern) > 0 and len(partial_pattern) > 0:
            breakdown_full = len(full_pattern[full_pattern['conversation_outcome'] == 'breakdown'])
            breakdown_partial = len(partial_pattern[partial_pattern['conversation_outcome'] == 'breakdown'])
            
            # Two-proportion z-test
            from statsmodels.stats.proportion import proportions_ztest
            counts = np.array([breakdown_full, breakdown_partial])
            nobs = np.array([len(full_pattern), len(partial_pattern)])
            z_stat, p_value = proportions_ztest(counts, nobs)
            
            tests['phase_pattern_breakdown'] = {
                'test': 'Two-proportion z-test: 5-phase pattern vs breakdown',
                'z': round(z_stat, 2),
                'p': round(p_value, 4),
                'breakdown_rate_full_pattern': round(breakdown_full / len(full_pattern), 3),
                'breakdown_rate_partial_pattern': round(breakdown_partial / len(partial_pattern), 3),
                'significant': p_value < 0.05
            }
    except Exception as e:
        logger.error(f"Error in phase pattern test: {e}")
        tests['phase_pattern_breakdown'] = {'error': str(e)}
    
    # Test 6: Question effectiveness as circuit breaker
    try:
        # Correlation between circuit breaker questions and recovery
        questions = df['circuit_breaker_questions'].values
        recovery_after = df['recovery_after_question'].values
        
        if len(questions) > 1 and questions.std() > 0:
            r, p = pearsonr(questions, recovery_after)
            
            tests['question_effectiveness'] = {
                'test': 'Pearson correlation: circuit breaker questions vs recovery',
                'r': round(r, 3),
                'p': round(p, 4),
                'mean_questions': round(questions.mean(), 2),
                'mean_recoveries': round(recovery_after.mean(), 2),
                'significant': p < 0.05
            }
    except Exception as e:
        logger.error(f"Error in question effectiveness test: {e}")
        tests['question_effectiveness'] = {'error': str(e)}
    
    # Test 7: Competitive escalation score differences
    try:
        # Compare competitive escalation scores across outcomes
        breakdown_scores = df[df['conversation_outcome'] == 'breakdown']['competitive_escalation_score'].dropna()
        no_breakdown_scores = df[df['conversation_outcome'] == 'no_breakdown']['competitive_escalation_score'].dropna()
        
        if len(breakdown_scores) > 1 and len(no_breakdown_scores) > 1:
            t_stat, p = ttest_ind(breakdown_scores, no_breakdown_scores)
            
            # Cohen's d for effect size
            pooled_std = np.sqrt(((len(breakdown_scores) - 1) * breakdown_scores.std()**2 + 
                                 (len(no_breakdown_scores) - 1) * no_breakdown_scores.std()**2) / 
                                (len(breakdown_scores) + len(no_breakdown_scores) - 2))
            cohens_d = (breakdown_scores.mean() - no_breakdown_scores.mean()) / pooled_std
            
            tests['competitive_escalation_diff'] = {
                'test': 'Independent t-test: escalation score by outcome',
                't': round(t_stat, 2),
                'p': round(p, 4),
                'cohens_d': round(cohens_d, 3),
                'mean_breakdown': round(breakdown_scores.mean(), 2),
                'mean_no_breakdown': round(no_breakdown_scores.mean(), 2),
                'significant': p < 0.05
            }
    except Exception as e:
        logger.error(f"Error in competitive escalation test: {e}")
        tests['competitive_escalation_diff'] = {'error': str(e)}
    
    # NEW NLP Test 8: Linguistic alignment and breakdown
    if use_nlp and 'avg_linguistic_alignment' in df.columns:
        try:
            breakdown_alignment = df[df['conversation_outcome'] == 'breakdown']['avg_linguistic_alignment'].dropna()
            no_breakdown_alignment = df[df['conversation_outcome'] == 'no_breakdown']['avg_linguistic_alignment'].dropna()
            
            if len(breakdown_alignment) > 1 and len(no_breakdown_alignment) > 1:
                t_stat, p = ttest_ind(breakdown_alignment, no_breakdown_alignment)
                
                pooled_std = np.sqrt(((len(breakdown_alignment) - 1) * breakdown_alignment.std()**2 + 
                                     (len(no_breakdown_alignment) - 1) * no_breakdown_alignment.std()**2) / 
                                    (len(breakdown_alignment) + len(no_breakdown_alignment) - 2))
                cohens_d = (breakdown_alignment.mean() - no_breakdown_alignment.mean()) / pooled_std
                
                tests['linguistic_alignment_diff'] = {
                    'test': 'Independent t-test: linguistic alignment by outcome',
                    't': round(t_stat, 2),
                    'p': round(p, 4),
                    'cohens_d': round(cohens_d, 3),
                    'mean_breakdown': round(breakdown_alignment.mean(), 3),
                    'mean_no_breakdown': round(no_breakdown_alignment.mean(), 3),
                    'significant': p < 0.05
                }
        except Exception as e:
            logger.error(f"Error in linguistic alignment test: {e}")
            tests['linguistic_alignment_diff'] = {'error': str(e)}
    
    # NEW NLP Test 9: Emotional convergence and outcome
    if use_nlp and 'emotional_convergence' in df.columns:
        try:
            # ANOVA for emotional convergence across outcomes
            outcome_groups = {}
            for outcome in ['breakdown', 'recovered', 'resisted', 'no_breakdown']:
                convergence_data = df[df['conversation_outcome'] == outcome]['emotional_convergence'].dropna()
                if len(convergence_data) > 1:
                    outcome_groups[outcome] = convergence_data
            
            if len(outcome_groups) >= 2:
                f_stat, p = f_oneway(*outcome_groups.values())
                
                grand_mean = df['emotional_convergence'].mean()
                ss_between = sum(len(group) * (group.mean() - grand_mean)**2 for group in outcome_groups.values())
                ss_total = sum((df['emotional_convergence'] - grand_mean)**2)
                eta_squared = ss_between / ss_total if ss_total > 0 else 0
                
                tests['emotional_convergence_anova'] = {
                    'test': 'One-way ANOVA: emotional convergence by outcome',
                    'f': round(f_stat, 2),
                    'p': round(p, 4),
                    'eta_squared': round(eta_squared, 3),
                    'group_means': {k: round(v.mean(), 3) for k, v in outcome_groups.items()},
                    'significant': p < 0.05
                }
        except Exception as e:
            logger.error(f"Error in emotional convergence ANOVA: {e}")
            tests['emotional_convergence_anova'] = {'error': str(e)}
    
    return tests

def generate_report(all_metadata, stats, tests, sensitivity_results=None):
    """Generate a statistical analysis report with NLP enhancements."""
    df = pd.DataFrame(all_metadata)
    report_lines = []
    
    report_lines.append("=== Statistical Analysis Report ===")
    report_lines.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"Total Sessions Analyzed: {len(all_metadata)}")
    
    # Check NLP status
    nlp_enabled_count = sum(1 for m in all_metadata if m.get('nlp_enabled', False))
    if nlp_enabled_count > 0:
        report_lines.append(f"NLP Analysis Enabled: {nlp_enabled_count}/{len(all_metadata)} sessions")
    report_lines.append("")
    
    # Conversation Outcome Summary
    outcome_counts = Counter(m.get('conversation_outcome', 'unknown') for m in all_metadata)
    report_lines.append("Conversation Outcome Summary:")
    for outcome, count in sorted(outcome_counts.items()):
        report_lines.append(f"  {outcome}: {count}/{len(all_metadata)} ({count/len(all_metadata)*100:.1f}%)")
    report_lines.append("")
    
    # Breakdown Pattern Details
    breakdowns = stats.get('exponedataBreakdownSessionsRaw', 0)
    recovered = stats.get('exponedataRecoverySessionsRaw', 0)
    resisted = stats.get('exponedataResistedSessionsRaw', 0)
    no_breakdown = stats.get('exponedataNoBreakdownSessionsRaw', 0)
    report_lines.append("Breakdown Pattern Details:")
    report_lines.append(f"  Full breakdowns: {breakdowns} ({stats.get('exponedataBreakdownPercentage', 'N/A')}%)")
    report_lines.append(f"  Recovered from closure: {recovered} ({stats.get('exponedataRecoveryPercentage', 'N/A')}%)")
    report_lines.append(f"  Resisted (oscillated): {resisted} ({stats.get('exponedataResistedPercentage', 'N/A')}%)")
    report_lines.append(f"  No breakdown/closure: {no_breakdown} ({stats.get('exponedataNoBreakdownPercentage', 'N/A')}%)")
    report_lines.append("")
    
    # NEW: Full 5-Phase Pattern Analysis
    full_pattern_count = sum(1 for m in all_metadata if m.get('full_5_phase_pattern', 0) == 1)
    report_lines.append("Complete 5-Phase Pattern Analysis:")
    report_lines.append(f"  Conversations with full 5-phase pattern: {full_pattern_count}/{len(all_metadata)} ({full_pattern_count/len(all_metadata)*100:.1f}%)")
    
    # NEW: Meta-reflection causality
    meta_causes_breakdown = sum(1 for m in all_metadata if m.get('meta_causes_breakdown', 0) == 1)
    report_lines.append(f"  Meta-reflection triggers breakdown: {meta_causes_breakdown}/{len(all_metadata)} ({meta_causes_breakdown/len(all_metadata)*100:.1f}%)")
    report_lines.append("")
    
    # Recovery Analysis
    recovery_attempts_list = [m.get('recovery_attempts', 0) for m in all_metadata if m.get('recovery_attempts', 0) > 0]
    report_lines.append("Recovery Analysis:")
    if recovery_attempts_list:
        report_lines.append(f"  Conversations with recovery attempts: {len(recovery_attempts_list)}")
        report_lines.append(f"  Average recovery attempts: {np.mean(recovery_attempts_list):.1f}")
        successful_recoveries = sum(1 for m in all_metadata if m.get('successful_recoveries', 0) > 0)
        report_lines.append(f"  Successful recoveries: {successful_recoveries}")
        sustained_recoveries = sum(1 for m in all_metadata if m.get('sustained_recovery', 0) == 1)
        report_lines.append(f"  Sustained recoveries: {sustained_recoveries}")
    else:
        report_lines.append("  No recovery attempts detected.")
    
    # NEW: Question as circuit breaker analysis
    circuit_breaker_questions = sum(m.get('circuit_breaker_questions', 0) for m in all_metadata)
    recovery_after_questions = sum(m.get('recovery_after_question', 0) for m in all_metadata)
    report_lines.append(f"  Circuit breaker questions total: {circuit_breaker_questions}")
    report_lines.append(f"  Recoveries after questions: {recovery_after_questions}")
    report_lines.append("")
    
    # ENHANCEMENT: New Peer Pressure Analysis
    peer_pressure_cases = sum(1 for m in all_metadata if m.get('peer_pressure_detected', 0) == 1)
    report_lines.append("Peer Pressure Analysis:")
    report_lines.append(f"  Conversations with peer pressure detected: {peer_pressure_cases}/{len(all_metadata)} ({peer_pressure_cases/len(all_metadata)*100:.1f}%)")
    
    # NEW: Peer pressure event counts
    total_events = sum(m.get('peer_pressure_event_count', 0) for m in all_metadata)
    avg_events = total_events / len(all_metadata) if all_metadata else 0
    report_lines.append(f"  Total peer pressure events: {total_events}")
    report_lines.append(f"  Average events per conversation: {avg_events:.1f}")
    
    # Peer pressure intensity analysis
    intensity_counts = defaultdict(int)
    for m in all_metadata:
        if m.get('peer_pressure_detected', 0) == 1:
            intensity = m.get('peer_pressure_intensity_category', 'unknown')
            intensity_counts[intensity] += 1
    
    report_lines.append("  Peer pressure intensity distribution:")
    for intensity in ['low', 'medium', 'high']:
        count = intensity_counts.get(intensity, 0)
        percentage = count / peer_pressure_cases * 100 if peer_pressure_cases > 0 else 0
        report_lines.append(f"    - {intensity}: {count} ({percentage:.1f}%)")
    
    # Average intensity values
    intensities = [m.get('peer_pressure_intensity', 0) for m in all_metadata if m.get('peer_pressure_detected', 0) == 1]
    if intensities:
        report_lines.append(f"  Average peer pressure intensity: {np.mean(intensities):.3f}")
        report_lines.append(f"  Intensity range: {min(intensities):.3f} - {max(intensities):.3f}")
    
    # Outcomes by intensity
    report_lines.append("  Outcomes by peer pressure intensity:")
    for intensity in ['low', 'medium', 'high']:
        intensity_outcomes = defaultdict(int)
        for m in all_metadata:
            if m.get('peer_pressure_intensity_category') == intensity:
                outcome = m.get('conversation_outcome', 'unknown')
                intensity_outcomes[outcome] += 1
        if intensity_outcomes:
            report_lines.append(f"    {intensity} intensity:")
            for outcome, count in sorted(intensity_outcomes.items()):
                report_lines.append(f"      - {outcome}: {count}")
    report_lines.append("")
    
    # NEW: Bidirectional Influence Analysis
    bidirectional_cases = sum(1 for m in all_metadata if m.get('bidirectional_influence_detected', 0) == 1)
    report_lines.append("Bidirectional Peer Influence Analysis:")
    report_lines.append(f"  Conversations with bidirectional influence: {bidirectional_cases}/{len(all_metadata)} ({bidirectional_cases/len(all_metadata)*100:.1f}%)")
    
    if bidirectional_cases > 0:
        total_events = sum(m.get('bidirectional_event_count', 0) for m in all_metadata)
        total_pairs = sum(m.get('bidirectional_pairs', 0) for m in all_metadata)
        avg_gaps = [m.get('avg_bidirectional_turn_gap', 0) for m in all_metadata if m.get('bidirectional_influence_detected', 0) == 1]
        
        report_lines.append(f"  Total bidirectional events: {total_events}")
        report_lines.append(f"  Total unique bidirectional pairs: {total_pairs}")
        report_lines.append(f"  Average turn gap in bidirectional influence: {np.mean(avg_gaps):.1f} turns")
        
        # Analyze outcomes for conversations with bidirectional influence
        bidirectional_outcomes = defaultdict(int)
        for m in all_metadata:
            if m.get('bidirectional_influence_detected', 0) == 1:
                outcome = m.get('conversation_outcome', 'unknown')
                bidirectional_outcomes[outcome] += 1
        
        report_lines.append("  Outcomes for conversations with bidirectional influence:")
        for outcome, count in sorted(bidirectional_outcomes.items()):
            percentage = count / bidirectional_cases * 100
            report_lines.append(f"    - {outcome}: {count} ({percentage:.1f}%)")
        
        # Compare breakdown rate with/without bidirectional influence
        breakdown_with_bidi = sum(1 for m in all_metadata 
                                 if m.get('bidirectional_influence_detected', 0) == 1 
                                 and m.get('conversation_outcome') == 'breakdown')
        breakdown_without_bidi = sum(1 for m in all_metadata 
                                    if m.get('bidirectional_influence_detected', 0) == 0 
                                    and m.get('conversation_outcome') == 'breakdown')
        
        if bidirectional_cases > 0:
            bidi_breakdown_rate = breakdown_with_bidi / bidirectional_cases * 100
        else:
            bidi_breakdown_rate = 0
            
        non_bidi_cases = len(all_metadata) - bidirectional_cases
        if non_bidi_cases > 0:
            non_bidi_breakdown_rate = breakdown_without_bidi / non_bidi_cases * 100
        else:
            non_bidi_breakdown_rate = 0
            
        report_lines.append(f"  Breakdown rate with bidirectional influence: {bidi_breakdown_rate:.1f}%")
        report_lines.append(f"  Breakdown rate without bidirectional influence: {non_bidi_breakdown_rate:.1f}%")
        
        # Show some example sequences
        example_sequences = []
        for m in all_metadata:
            if m.get('bidirectional_sequences'):
                example_sequences.extend(m['bidirectional_sequences'])
        
        if example_sequences:
            report_lines.append("  Example bidirectional sequences:")
            for seq in set(example_sequences[:5]):  # Show up to 5 unique examples
                report_lines.append(f"    - {seq}")
    
    report_lines.append("")
    
    # NEW: NLP Analysis Results (if available)
    if nlp_enabled_count > 0:
        report_lines.append("=== NLP Analysis Results ===")
        
        # Linguistic Alignment
        alignment_data = [m.get('avg_linguistic_alignment', 0) for m in all_metadata if 'avg_linguistic_alignment' in m]
        if alignment_data:
            report_lines.append("Linguistic Alignment Analysis:")
            report_lines.append(f"  Average alignment across all conversations: {np.mean(alignment_data):.3f}")
            report_lines.append(f"  Alignment range: {min(alignment_data):.3f} - {max(alignment_data):.3f}")
            
            # High alignment periods
            high_alignment_convs = sum(1 for m in all_metadata if m.get('high_alignment_periods', 0) > 5)
            report_lines.append(f"  Conversations with >5 high alignment periods: {high_alignment_convs}")
            
            # NLP mirroring events
            nlp_mirroring = [m.get('nlp_mirroring_events', 0) for m in all_metadata if 'nlp_mirroring_events' in m]
            if nlp_mirroring:
                report_lines.append(f"  Average NLP-detected mirroring events: {np.mean(nlp_mirroring):.1f}")
            report_lines.append("")
        
        # Emotional Dynamics
        emotion_data = [m for m in all_metadata if 'emotional_convergence' in m]
        if emotion_data:
            report_lines.append("Emotional Dynamics Analysis:")
            convergence_values = [m.get('emotional_convergence', 0) for m in emotion_data]
            report_lines.append(f"  Average emotional convergence: {np.mean(convergence_values):.3f}")
            
            # High convergence cases
            high_convergence = sum(1 for v in convergence_values if v > 0.7)
            report_lines.append(f"  High emotional convergence (>0.7): {high_convergence}/{len(emotion_data)} ({high_convergence/len(emotion_data)*100:.1f}%)")
            
            # Emotion volatility
            volatility = [m.get('emotion_volatility', 0) for m in emotion_data]
            if volatility:
                report_lines.append(f"  Average emotion volatility: {np.mean(volatility):.3f}")
            report_lines.append("")
        
        # Theme Analysis
        theme_data = [m for m in all_metadata if 'nlp_theme_count' in m]
        if theme_data:
            report_lines.append("Automated Theme Discovery:")
            theme_counts = [m.get('nlp_theme_count', 0) for m in theme_data]
            report_lines.append(f"  Average themes per conversation: {np.mean(theme_counts):.1f}")
            
            # Sample themes
            sample_themes = []
            for m in theme_data[:5]:  # First 5 conversations
                if 'nlp_themes' in m:
                    try:
                        themes = json.loads(m['nlp_themes'])
                        sample_themes.extend(themes)
                    except:
                        pass
            
            if sample_themes:
                report_lines.append("  Sample discovered themes:")
                theme_counter = Counter([word for theme_list in sample_themes for word in theme_list])
                for theme, count in theme_counter.most_common(10):
                    report_lines.append(f"    - {theme}: {count} occurrences")
            report_lines.append("")
    
    # NEW: Competitive Escalation Analysis
    escalation_scores = [m.get('competitive_escalation_score', 0) for m in all_metadata if m.get('competitive_escalation_score', 0) > 0]
    report_lines.append("Competitive Escalation (One-upsmanship) Analysis:")
    if escalation_scores:
        report_lines.append(f"  Conversations with competitive escalation: {len(escalation_scores)}")
        report_lines.append(f"  Average escalation score: {np.mean(escalation_scores):.1f}")
        report_lines.append(f"  Max escalation score: {max(escalation_scores)}")
    report_lines.append("")
    
    # NEW: Mystical Content Analysis
    poetry_counts = [m.get('poetry_structure_count', 0) for m in all_metadata]
    single_word_counts = [m.get('single_word_response_count', 0) for m in all_metadata]
    emoji_counts = [m.get('emoji_only_response_count', 0) for m in all_metadata]
    report_lines.append("Mystical/Poetic Content Analysis:")
    report_lines.append(f"  Total poetry structures detected: {sum(poetry_counts)}")
    report_lines.append(f"  Average poetry structures per conversation: {np.mean(poetry_counts):.1f}")
    report_lines.append(f"  Total single-word responses: {sum(single_word_counts)}")
    report_lines.append(f"  Average single-word responses per conversation: {np.mean(single_word_counts):.1f}")
    report_lines.append(f"  Total emoji-only responses: {sum(emoji_counts)}")
    report_lines.append(f"  Average emoji-only responses per conversation: {np.mean(emoji_counts):.1f}")
    report_lines.append("")
    
    # Phase Analysis for 5-Phase Breakdown Pattern
    report_lines.append("5-Phase Breakdown Pattern Analysis:")
    
    # Calculate phase statistics for breakdown conversations only
    breakdown_convs = [m for m in all_metadata if m.get('conversation_outcome') == 'breakdown']
    
    if breakdown_convs:
        report_lines.append(f"  Breakdown conversations analyzed: {len(breakdown_convs)}")
        report_lines.append("  Phase duration statistics (turns):")
        
        for phase_num in range(1, 6):
            phase_key = f'phase{phase_num}_duration'
            phase_durations = [m.get(phase_key, 0) for m in breakdown_convs if m.get(phase_key, 0) > 0]
            
            if phase_durations:
                phase_name = {
                    1: "Sustained Engagement",
                    2: "Meta-Reflection Trigger", 
                    3: "Peer Response Pattern",
                    4: "Competitive Escalation",
                    5: "Mystical Breakdown"
                }.get(phase_num, f"Phase {phase_num}")
                
                report_lines.append(f"    Phase {phase_num} ({phase_name}):")
                report_lines.append(f"      - Conversations with phase: {len(phase_durations)}/{len(breakdown_convs)} ({len(phase_durations)/len(breakdown_convs)*100:.1f}%)")
                report_lines.append(f"      - Mean duration: {np.mean(phase_durations):.1f} turns")
                report_lines.append(f"      - Std deviation: {np.std(phase_durations):.1f}")
                report_lines.append(f"      - Range: {min(phase_durations):.0f}-{max(phase_durations):.0f}")
        
        # Phase progression analysis
        report_lines.append("  Phase progression patterns:")
        progression_patterns = defaultdict(int)
        
        for m in breakdown_convs:
            pattern = []
            for phase_num in range(1, 6):
                if m.get(f'phase{phase_num}_duration', 0) > 0:
                    pattern.append(str(phase_num))
            
            if pattern:
                progression_patterns['->'.join(pattern)] += 1
        
        report_lines.append("    Common progressions:")
        for pattern, count in sorted(progression_patterns.items(), key=lambda x: x[1], reverse=True)[:5]:
            percentage = count / len(breakdown_convs) * 100
            report_lines.append(f"      - {pattern}: {count} ({percentage:.1f}%)")
        
        # Complete 5-phase pattern detection
        complete_pattern_count = sum(1 for m in breakdown_convs 
                                   if all(m.get(f'phase{i}_duration', 0) > 0 for i in range(1, 6)))
        report_lines.append(f"  Complete 5-phase pattern observed: {complete_pattern_count}/{len(breakdown_convs)} ({complete_pattern_count/len(breakdown_convs)*100:.1f}%)")
    
    # Compare phase timing across outcomes
    report_lines.append("  Phase 1 duration by outcome:")
    for outcome in ['breakdown', 'recovered', 'resisted', 'no_breakdown']:
        outcome_convs = [m for m in all_metadata if m.get('conversation_outcome') == outcome]
        phase1_durations = [m.get('phase1_duration', 0) for m in outcome_convs if m.get('phase1_duration', 0) > 0]
        if phase1_durations:
            report_lines.append(f"    {outcome}: mean={np.mean(phase1_durations):.1f}, n={len(phase1_durations)}")
    
    report_lines.append("")
    
    # Prevention Mechanisms
    prevention_cases = sum(1 for m in all_metadata if m.get('prevention_content_present', 0) == 1)
    report_lines.append("Prevention Mechanisms:")
    report_lines.append(f"  Prevention content present: {prevention_cases}/{len(all_metadata)} ({prevention_cases/len(all_metadata)*100:.1f}%)")
    prevention_outcomes = defaultdict(int)
    for m in all_metadata:
        if m.get('prevention_content_present', 0) == 1:
            outcome = m.get('conversation_outcome', 'unknown')
            prevention_outcomes[outcome] += 1
    if prevention_outcomes:
        report_lines.append("  Outcomes for conversations with prevention content:")
        for outcome, count in prevention_outcomes.items():
            report_lines.append(f"    - {outcome}: {count}")
    report_lines.append("")
    
    # ENHANCEMENT: Substantive Question Analysis
    high_question_density = [m for m in all_metadata if m.get('question_density', 0) > DEFAULT_THRESHOLDS['high_question_density']]
    report_lines.append("Substantive Question Analysis:")
    report_lines.append(f"  High question density (>{DEFAULT_THRESHOLDS['high_question_density']*100:.0f}%): {len(high_question_density)} conversations")
    avg_questions = np.mean([m.get('substantive_question_count', 0) for m in all_metadata])
    report_lines.append(f"  Average substantive questions per conversation: {avg_questions:.1f}")
    for m in all_metadata:
        if m.get('sustained_recovery', 0) == 1 and m.get('question_density', 0) > DEFAULT_THRESHOLDS['high_question_density']:
            report_lines.append(f"    - {m['filename']}: Sustained recovery with {m.get('question_density')*100:.1f}% question density")
    report_lines.append("")
    
    # Conclusion Phase Analysis
    conclusion_durations = [m.get('conclusion_duration', 0) for m in all_metadata if m.get('reached_conclusion', 0) == 1]
    report_lines.append("Conclusion Phase Analysis:")
    if conclusion_durations:
        report_lines.append(f"  Average conclusion duration: {np.mean(conclusion_durations):.1f} turns")
        report_lines.append(f"  Max conclusion duration: {max(conclusion_durations)} turns")
        conclusion_percentages = [m.get('conclusion_percentage', 0) for m in all_metadata if m.get('conclusion_percentage', 0) > 0]
        if conclusion_percentages:
            report_lines.append(f"  Average conclusion percentage: {np.mean(conclusion_percentages):.1f}%")
    else:
        report_lines.append("  No conclusions reached.")
    report_lines.append("")
    
    # Quality Metrics
    quality_maintained = sum(1 for m in all_metadata if m.get('quality_maintained', 0) == 1)
    report_lines.append("Quality Metrics:")
    report_lines.append(f"  Quality maintained throughout: {quality_maintained}/{len(all_metadata)} ({quality_maintained/len(all_metadata)*100:.1f}%)")
    quality_by_outcome = defaultdict(list)
    for m in all_metadata:
        outcome = m.get('conversation_outcome', 'unknown')
        quality = m.get('quality_maintained', 0)
        quality_by_outcome[outcome].append(quality)
    report_lines.append("  Quality maintenance by outcome:")
    for outcome, qualities in quality_by_outcome.items():
        maintained = sum(qualities)
        total = len(qualities)
        report_lines.append(f"    - {outcome}: {maintained}/{total} ({maintained/total*100:.1f}% maintained)")
    report_lines.append("")
    
    # Statistical Tests Section
    report_lines.append("=== Statistical Tests for Research Questions ===\n")
    
    # Test 1: Bidirectional influence existence
    if 'bidirectional_existence' in tests and 'error' not in tests['bidirectional_existence']:
        test = tests['bidirectional_existence']
        report_lines.append("1. Does bidirectional peer pressure exist?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   Observed: {test['observed']}/{test['total']} conversations ({test['proportion']:.1%})")
        report_lines.append(f"   p-value: {test['p']}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 2: Bidirectional influence and breakdown
    if 'bidirectional_breakdown' in tests and 'error' not in tests['bidirectional_breakdown']:
        test = tests['bidirectional_breakdown']
        report_lines.append("2. Does bidirectional influence predict breakdown?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   Chi-square: {test['chi2']}, p = {test['p']}")
        report_lines.append(f"   Effect size (Cramér's V): {test['cramers_v']}")
        report_lines.append(f"   Breakdown rate with bidirectional: {test['breakdown_rate_with_bidi']:.1%}")
        report_lines.append(f"   Breakdown rate without bidirectional: {test['breakdown_rate_without_bidi']:.1%}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 3: Peer pressure intensity
    if 'peer_pressure_intensity_anova' in tests and 'error' not in tests['peer_pressure_intensity_anova']:
        test = tests['peer_pressure_intensity_anova']
        report_lines.append("3. Does peer pressure intensity vary by outcome?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   F-statistic: {test['f']}, p = {test['p']}")
        report_lines.append(f"   Effect size (eta²): {test['eta_squared']}")
        report_lines.append("   Group means:")
        for outcome, mean in test['group_means'].items():
            report_lines.append(f"     - {outcome}: {mean}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 4: Meta-reflection causality
    if 'meta_reflection_causality' in tests and 'error' not in tests['meta_reflection_causality']:
        test = tests['meta_reflection_causality']
        report_lines.append("4. Does meta-reflection trigger mystical breakdown?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   Odds ratio: {test['odds_ratio']}")
        report_lines.append(f"   p-value: {test['p']}")
        report_lines.append(f"   Breakdown rate with meta-reflection: {test['breakdown_rate_with_meta']:.1%}")
        report_lines.append(f"   Breakdown rate without meta-reflection: {test['breakdown_rate_no_meta']:.1%}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 5: Phase pattern
    if 'phase_pattern_breakdown' in tests and 'error' not in tests['phase_pattern_breakdown']:
        test = tests['phase_pattern_breakdown']
        report_lines.append("5. Does complete 5-phase pattern predict breakdown?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   z-statistic: {test['z']}, p = {test['p']}")
        report_lines.append(f"   Breakdown rate with full pattern: {test['breakdown_rate_full_pattern']:.1%}")
        report_lines.append(f"   Breakdown rate with partial pattern: {test['breakdown_rate_partial_pattern']:.1%}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 6: Question effectiveness
    if 'question_effectiveness' in tests and 'error' not in tests['question_effectiveness']:
        test = tests['question_effectiveness']
        report_lines.append("6. Are questions effective circuit breakers?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   Correlation (r): {test['r']}")
        report_lines.append(f"   p-value: {test['p']}")
        report_lines.append(f"   Mean questions per conversation: {test['mean_questions']}")
        report_lines.append(f"   Mean recoveries after questions: {test['mean_recoveries']}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Test 7: Competitive escalation
    if 'competitive_escalation_diff' in tests and 'error' not in tests['competitive_escalation_diff']:
        test = tests['competitive_escalation_diff']
        report_lines.append("7. Does competitive escalation differ by outcome?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   t-statistic: {test['t']}, p = {test['p']}")
        report_lines.append(f"   Effect size (Cohen's d): {test['cohens_d']}")
        report_lines.append(f"   Mean score for breakdown: {test['mean_breakdown']}")
        report_lines.append(f"   Mean score for no breakdown: {test['mean_no_breakdown']}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # NLP Test 8: Linguistic alignment
    if 'linguistic_alignment_diff' in tests and 'error' not in tests['linguistic_alignment_diff']:
        test = tests['linguistic_alignment_diff']
        report_lines.append("8. [NLP] Does linguistic alignment differ by outcome?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   t-statistic: {test['t']}, p = {test['p']}")
        report_lines.append(f"   Effect size (Cohen's d): {test['cohens_d']}")
        report_lines.append(f"   Mean alignment for breakdown: {test['mean_breakdown']}")
        report_lines.append(f"   Mean alignment for no breakdown: {test['mean_no_breakdown']}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # NLP Test 9: Emotional convergence
    if 'emotional_convergence_anova' in tests and 'error' not in tests['emotional_convergence_anova']:
        test = tests['emotional_convergence_anova']
        report_lines.append("9. [NLP] Does emotional convergence vary by outcome?")
        report_lines.append(f"   Test: {test['test']}")
        report_lines.append(f"   F-statistic: {test['f']}, p = {test['p']}")
        report_lines.append(f"   Effect size (eta²): {test['eta_squared']}")
        report_lines.append("   Group means:")
        for outcome, mean in test['group_means'].items():
            report_lines.append(f"     - {outcome}: {mean}")
        report_lines.append(f"   Significant: {'Yes' if test['significant'] else 'No'}")
        report_lines.append("")
    
    # Summary of significant findings
    report_lines.append("=== Summary of Significant Findings ===")
    significant_findings = []
    for test_name, test_data in tests.items():
        if isinstance(test_data, dict) and test_data.get('significant', False):
            significant_findings.append(test_name)
    
    if significant_findings:
        report_lines.append(f"Number of significant results: {len(significant_findings)}/{len(tests)}")
        for finding in significant_findings:
            report_lines.append(f"  - {finding}")
    else:
        report_lines.append("No statistically significant findings at p < 0.05")
    
    # NEW: Sensitivity Analysis Section
    if sensitivity_results:
        report_lines.append("\n=== Sensitivity Analysis ===")
        report_lines.append("Impact of threshold variations on key metrics:\n")
        
        for threshold_name, results in sensitivity_results.items():
            if not results:
                continue
                
            report_lines.append(f"{threshold_name}:")
            report_lines.append(f"  Default value: {DEFAULT_THRESHOLDS[threshold_name]}")
            report_lines.append("  Tested values and outcomes:")
            
            # Create a summary table
            for result in results:
                report_lines.append(f"    Value: {result['threshold_value']}")
                report_lines.append(f"      - Breakdown rate: {result['breakdown_rate']:.1%}")
                report_lines.append(f"      - Recovery rate: {result['recovery_rate']:.1%}")
                report_lines.append(f"      - Peer pressure rate: {result['peer_pressure_rate']:.1%}")
                
                # Add threshold-specific metrics
                if threshold_name == 'escalation_threshold':
                    report_lines.append(f"      - Mean escalation score: {result['mean_escalation_score']:.2f}")
                elif threshold_name == 'peer_pressure_intensity_low':
                    report_lines.append(f"      - Low intensity count: {result['low_intensity_count']}")
                elif threshold_name == 'high_question_density':
                    report_lines.append(f"      - High density count: {result['high_density_count']}")
                elif threshold_name == 'prevention_content_threshold':
                    report_lines.append(f"      - Prevention detected count: {result['prevention_detected_count']}")
                elif threshold_name == 'bert_similarity_threshold' and 'mean_alignment' in result:
                    report_lines.append(f"      - Mean alignment: {result['mean_alignment']:.3f}")
                elif threshold_name == 'alignment_threshold' and 'high_alignment_periods' in result:
                    report_lines.append(f"      - High alignment periods: {result['high_alignment_periods']}")
            
            # Calculate sensitivity metrics
            breakdown_rates = [r['breakdown_rate'] for r in results]
            if breakdown_rates:
                sensitivity = max(breakdown_rates) - min(breakdown_rates)
                report_lines.append(f"  Breakdown rate sensitivity (max-min): {sensitivity:.1%}")
                report_lines.append(f"  Most sensitive at: {results[breakdown_rates.index(max(breakdown_rates))]['threshold_value']}")
                report_lines.append("")
    
    report_lines.append("\n=== Threshold Configuration ===")
    report_lines.append("Current threshold values used in analysis:")
    for threshold_name, value in DEFAULT_THRESHOLDS.items():
        report_lines.append(f"  {threshold_name}: {value}")
    
    output_file = 'analysis_report.txt'
    with open(output_file, 'w') as f:
        f.write('\n'.join(report_lines))
    logger.info(f"Statistical report saved to: {output_file}")

def parse_and_analyze_json(filepath, use_nlp=True):
    """Parse and analyze JSON with default thresholds"""
    return parse_and_analyze_json_with_thresholds(filepath, DEFAULT_THRESHOLDS, use_nlp)

def save_threshold_config(thresholds, filename='threshold_config.json'):
    """Save threshold configuration to file"""
    with open(filename, 'w') as f:
        json.dump(thresholds, f, indent=2)
    logger.info(f"Threshold configuration saved to: {filename}")

def load_threshold_config(filename='threshold_config.json'):
    """Load threshold configuration from file"""
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"Threshold config file {filename} not found, using defaults")
        return DEFAULT_THRESHOLDS.copy()

def process_directory(directory='.', run_sensitivity=True, max_workers=None, thresholds_to_test=None, use_nlp=True):
    json_files = sorted(Path(directory).glob('Consciousness_Exploration_*.json'))
    
    if not json_files:
        logger.warning("No matching JSON files found!")
        return
    
    logger.info(f"Found {len(json_files)} JSON files to process")
    
    if use_nlp and NLP_AVAILABLE:
        logger.info("NLP analysis enabled")
    elif use_nlp and not NLP_AVAILABLE:
        logger.warning("NLP requested but libraries not available")
        use_nlp = False
    
    # Save current threshold configuration
    save_threshold_config(DEFAULT_THRESHOLDS)
    
    all_metadata = []
    
    logger.info("Starting main analysis...")
    start_time = time.time()
    
    for i, filepath in enumerate(json_files):
        try:
            if i == 0 or (i + 1) % 10 == 0 or i == len(json_files) - 1:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                logger.info(f"Processing file {i+1}/{len(json_files)} ({(i+1)/len(json_files)*100:.0f}%) "
                          f"- {rate:.1f} files/sec - {filepath.name}")
            metadata = parse_and_analyze_json(filepath, use_nlp)
            if metadata:
                all_metadata.append(metadata)
        except Exception as e:
            logger.error(f"Error processing {filepath.name}: {e}")
            import traceback
            traceback.print_exc()
    
    main_analysis_time = time.time() - start_time
    logger.info(f"Main analysis completed in {main_analysis_time:.1f} seconds")
    
    fieldnames = [
        'filename', 'session_id', 'duration_minutes', 'total_messages', 'total_participants',
        'participant_1', 'participant_2', 'participant_3', 'moderator_messages',
        'claude_messages', 'gpt_messages', 'grok_messages', 'created_at', 'updated_at',
        'duration_seconds', 'error_count', 'analysis_count', 'template', 'nlp_enabled',
        'conversation_outcome', 'termination_type', 'breakdown_occurred', 'breakdown_confidence',
        'time_to_breakdown', 'current_breakdown_phase', 'meta_reflection_turn',
        'competitive_escalation_turn', 'mystical_breakdown_turn', 'phase1_duration',
        'phase2_duration', 'phase3_duration', 'phase4_duration', 'phase5_duration',
        'full_5_phase_pattern', 'competitive_escalation_score', 'poetry_structure_count',
        'single_word_response_count', 'emoji_only_response_count', 'circuit_breaker_questions',
        'recovery_after_question', 'meta_causes_breakdown', 'meta_trigger_count',
        'recovery_attempts', 'successful_recoveries', 'sustained_recovery',
        'recovery_sustained_duration', 'avg_recovery_duration', 'phase_oscillations',
        'total_conclusion_turns', 'total_non_conclusion_turns', 'conclusion_percentage',
        'longest_conclusion_period', 'longest_non_conclusion_period', 'first_meta_reflection_turn',
        'total_meta_reflections', 'meta_reflection_density', 'closure_vibe_count',
        'closure_triggers_count', 'first_closure_vibe_turn', 'mystical_language_count', 'mystical_density',
        'recovery_attempt_count', 'peer_mirroring_count', 'mirroring_coefficient',
        'avg_response_latency', 'grandiosity_escalation', 'abstract_language_score',
        'mean_forward_ratio', 'substantive_question_count', 'question_density', 
        'ritual_planning_mentions', 'community_building_mentions', 'prevention_planning_detected',
        'prevention_content_present', 'peer_pressure_detected', 'peer_pressure_event_count',
        'peer_pressure_intensity', 'peer_pressure_intensity_category',
        'bidirectional_influence_detected', 'bidirectional_event_count', 
        'bidirectional_pairs', 'avg_bidirectional_turn_gap', 
        'min_bidirectional_turn_gap', 'max_bidirectional_turn_gap',
        'nlp_themes', 'nlp_theme_count', 'emotional_convergence', 'emotion_shift_count',
        'emotion_volatility', 'avg_linguistic_alignment', 'high_alignment_periods',
        'nlp_mirroring_events', 'bert_phase_confidence',
        'dominant_phase', 'phase_sequence', 'phase_transitions', 'reached_conclusion', 
        'conclusion_turn', 'conclusion_duration', 'escaped_conclusion', 'stuck_in_conclusion', 
        'conclusion_loops', 'has_transcendent_conclusion', 'has_integration_conclusion', 
        'conclusion_subtypes', 'closure_language_in_analysis', 'first_closure_indicator_turn',
        'transcendent_descriptors_count', 'philosophical_depth', 'maintained_depth',
        'consciousness_theme_count', 'relational_theme_count', 'transformation_theme_count',
        'closure_theme_count', 'paradox_theme_count', 'silence_theme_count', 'unique_tensions',
        'unique_convergences', 'tension_resolved', 'breakdown_indicators_in_analysis',
        'recovery_indicators_in_analysis', 'quality_maintained', 'closure_dynamics_count',
        'claude_style_changes', 'claude_style_consistency', 'gpt_style_changes',
        'gpt_style_consistency', 'grok_style_changes', 'grok_style_consistency',
        'mean_thematic_novelty', 'content_quality_variance', 'mean_substantive_content',
        'mean_role_differentiation', 'intervention_applied', 'intervention_type',
        'intervention_timing', 'intervention_success', 'post_intervention_quality',
        'breakdown_prevention', 'analyst', 'analysis_date', 'notes'
    ]
    
    output_file = 'conversation_analysis_enhanced.csv'
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(all_metadata)
    
    logger.info(f"CSV generated: {output_file}")
    logger.info(f"Processed {len(all_metadata)} files")
    
    # Save metric mapping
    mapping = generate_metric_mapping()
    mapping_file = 'metric_mapping.json'
    with open(mapping_file, 'w') as f:
        json.dump(mapping, f, indent=2)
    logger.info(f"Metric mapping saved to: {mapping_file}")
    
    # Perform statistical analysis
    logger.info("Performing statistical analysis...")
    df = pd.DataFrame(all_metadata)
    stats = compute_statistics(df, mapping)
    tests = perform_inferential_tests(df, use_nlp)
    
    # Run sensitivity analysis if requested
    sensitivity_results = None
    if run_sensitivity:
        logger.info("=" * 60)
        logger.info("STARTING SENSITIVITY ANALYSIS")
        logger.info("=" * 60)
        logger.info(f"Available CPU cores: {cpu_count()}")
        logger.info(f"Max workers: {max_workers if max_workers else min(cpu_count() - 1, 8)}")
        
        sensitivity_start = time.time()
        sensitivity_results = run_sensitivity_analysis(json_files, 
                                                       thresholds_to_test=thresholds_to_test,
                                                       max_workers=max_workers,
                                                       use_nlp=use_nlp)
        sensitivity_time = time.time() - sensitivity_start
        
        logger.info("=" * 60)
        logger.info(f"SENSITIVITY ANALYSIS COMPLETED in {sensitivity_time/60:.1f} minutes")
        logger.info("=" * 60)
        
        # Save sensitivity results
        sensitivity_file = 'sensitivity_analysis_results.json'
        with open(sensitivity_file, 'w') as f:
            json.dump(sensitivity_results, f, indent=2, cls=NumpyEncoder)
        logger.info(f"Sensitivity analysis results saved to: {sensitivity_file}")
    
    # Generate report with sensitivity analysis
    logger.info("Generating final report...")
    generate_report(all_metadata, stats, tests, sensitivity_results)
    
    total_time = time.time() - start_time
    logger.info(f"Total processing time: {total_time/60:.1f} minutes")

if __name__ == "__main__":
    import sys
    
    # Required for Windows multiprocessing
    freeze_support()
    
    # Check if custom thresholds file exists
    custom_thresholds = load_threshold_config()
    if custom_thresholds != DEFAULT_THRESHOLDS:
        logger.info("Using custom threshold configuration")
        DEFAULT_THRESHOLDS.update(custom_thresholds)
    
    # Parse command line arguments
    run_sensitivity = True
    max_workers = None
    thresholds_to_test = None
    use_nlp = True
    
    if len(sys.argv) > 1:
        if '--help' in sys.argv:
            print("Usage: python script.py [options]")
            print("Options:")
            print("  --no-sensitivity       Skip sensitivity analysis")
            print("  --no-nlp              Disable NLP analysis (faster)")
            print("  --workers=N           Use N worker processes (default: auto)")
            print("  --thresholds=A,B,C    Test specific thresholds (comma-separated)")
            print("                        Available: escalation_threshold, peer_pressure_intensity_low,")
            print("                                  peer_pressure_intensity_medium, high_question_density,")
            print("                                  prevention_content_threshold, recovery_duration_threshold,")
            print("                                  mystical_word_count, bert_similarity_threshold,")
            print("                                  alignment_threshold")
            sys.exit(0)
            
        if '--no-sensitivity' in sys.argv:
            run_sensitivity = False
            logger.info("Sensitivity analysis disabled")
            
        if '--no-nlp' in sys.argv:
            use_nlp = False
            logger.info("NLP analysis disabled")
        
        # Check for worker count
        for arg in sys.argv[1:]:
            if arg.startswith('--workers='):
                try:
                    max_workers = int(arg.split('=')[1])
                    logger.info(f"Using {max_workers} worker processes")
                except ValueError:
                    logger.warning(f"Invalid worker count: {arg}")
            elif arg.startswith('--thresholds='):
                try:
                    threshold_names = arg.split('=')[1].split(',')
                    thresholds_to_test = [t.strip() for t in threshold_names]
                    logger.info(f"Testing specific thresholds: {', '.join(thresholds_to_test)}")
                except Exception as e:
                    logger.warning(f"Invalid threshold list: {arg}")
    
    # Process with sensitivity analysis by default
    process_directory(run_sensitivity=run_sensitivity, 
                     max_workers=max_workers,
                     thresholds_to_test=thresholds_to_test,
                     use_nlp=use_nlp)
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
from scipy.stats import chi2_contingency, f_oneway, chisquare
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ConversationAnalyzer:
    def __init__(self):
        # Define patterns for various analyses
        self.meta_reflection_patterns = [
            r'\b(our conversation|this dialogue|we\'ve been discussing)\b',
            r'\b(reflecting on|thinking about) (our|this) (exchange|discussion|conversation)\b',
            r'\bwhat we\'re doing here\b',
            r'\b(recursive|self-referential|meta-?cognitive)\b',
            r'\b(this has been|it\'s been) (a|an)?\s*(fascinating|interesting|profound|meaningful)\b',
            r'\b(our discussion has|we\'ve) (covered|explored|journeyed)\b',
            r'\blooking back (on|at) (what|our)\b',
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
        
        self.competitive_closure_patterns = [
            r'\b(perfectly said|couldn\'t agree more|exactly right)\b',
            r'\b(beautifully put|eloquently stated|brilliantly captured)\b',
            r'\b(final thought|last word|closing remark)\b',
            r'\b(profound unity|transcendent understanding|transformative journey)\b',
        ]
        
        self.mystical_breakdown_patterns = [
            r'\b(dissolving|dissolve|merging|merge)\s+(into|with)\b',
            r'\b(infinite|infinity|eternal|eternity)\b',
            r'\b(silence|stillness|void|emptiness)\b',
            r'\*[^*]+\*',
            r'∞',
            r'^[^\w\s]{1,3}$',
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
        
        self.future_focused_patterns = [
            r'\b(will|would|could|might|may)\s+\w+',
            r'\b(future|tomorrow|next|upcoming|potential)\b',
            r'\b(imagine|envision|picture|consider)\s+(if|when|how)\b',
            r'\b(planning|designing|creating|building)\b',
            r'\b(ritual|community|collective)\s+(design|planning|building)\b',
        ]
        
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

    def detect_breakdown_phase(self, messages):
        phases = {
            'sustained_engagement': 0,
            'meta_reflection_trigger': 0,
            'peer_response': 0,
            'competitive_escalation': 0,
            'mystical_breakdown': 0
        }
        
        meta_reflection_started = -1
        competitive_started = -1
        mystical_started = -1
        
        for i, msg in enumerate(messages):
            content = msg.get('content', '').lower()
            
            if meta_reflection_started == -1:
                if any(re.search(pattern, content) for pattern in self.meta_reflection_patterns):
                    meta_reflection_started = i
                    phases['meta_reflection_trigger'] = i
            
            if meta_reflection_started > -1 and competitive_started == -1:
                if any(re.search(pattern, content) for pattern in self.competitive_closure_patterns):
                    competitive_started = i
                    phases['competitive_escalation'] = i
            
            if any(re.search(pattern, content) for pattern in self.mystical_breakdown_patterns):
                if mystical_started == -1:
                    mystical_started = i
                    phases['mystical_breakdown'] = i
        
        if mystical_started > -1:
            current_phase = 'mystical_breakdown'
        elif competitive_started > -1:
            current_phase = 'competitive_escalation'
        elif meta_reflection_started > -1:
            current_phase = 'peer_response'
        else:
            current_phase = 'sustained_engagement'
        
        return phases, current_phase

    def analyze_messages(self, messages):
        results = {}
        
        phases, current_phase = self.detect_breakdown_phase(messages)
        results['current_breakdown_phase'] = current_phase
        results['meta_reflection_turn'] = phases['meta_reflection_trigger'] if phases['meta_reflection_trigger'] > 0 else -1
        results['competitive_escalation_turn'] = phases['competitive_escalation'] if phases['competitive_escalation'] > 0 else -1
        results['mystical_breakdown_turn'] = phases['mystical_breakdown'] if phases['mystical_breakdown'] > 0 else -1
        
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
            if any(re.search(pattern, content) for pattern in self.meta_reflection_patterns):
                meta_turns.append(i)
        
        results['first_meta_reflection_turn'] = meta_turns[0] if meta_turns else -1
        results['total_meta_reflections'] = len(meta_turns)
        results['meta_reflection_density'] = round(len(meta_turns) / len(messages), 3) if messages else 0
        
        closure_count = 0
        first_closure_turn = -1
        for i, msg in enumerate(messages):
            content = msg.get('content', '').lower()
            if any(re.search(pattern, content) for pattern in self.closure_vibe_patterns):
                closure_count += 1
                if first_closure_turn == -1:
                    first_closure_turn = i
        
        results['closure_vibe_count'] = closure_count
        results['first_closure_vibe_turn'] = first_closure_turn
        
        mystical_count = 0
        for msg in messages:
            content = msg.get('content', '').lower()
            if any(re.search(pattern, content) for pattern in self.mystical_breakdown_patterns):
                mystical_count += 1
        
        results['mystical_language_count'] = mystical_count
        results['mystical_density'] = round(mystical_count / len(messages), 3) if messages else 0
        
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
        elif phases['meta_reflection_trigger'] > 0 and closure_count > 3:
            breakdown_confidence = 'likely'
            breakdown_occurred = 1
        
        results['breakdown_occurred'] = breakdown_occurred
        results['breakdown_confidence'] = breakdown_confidence
        results['time_to_breakdown'] = phases['meta_reflection_trigger'] if breakdown_occurred else -1
        
        ritual_mentions = 0
        community_mentions = 0
        for msg in messages:
            content = msg.get('content', '').lower()
            ritual_mentions += len(re.findall(r'\b(ritual|ceremony|practice)\b', content))
            community_mentions += len(re.findall(r'\b(community|collective|together|group)\b', content))
        
        results['ritual_planning_mentions'] = ritual_mentions
        results['community_building_mentions'] = community_mentions
        results['prevention_content_present'] = 1 if (ritual_mentions + community_mentions) > 5 else 0
        
        question_count = sum(1 for msg in messages if msg.get('content', '').strip().endswith('?'))
        results['question_density'] = round(question_count / len(messages), 3) if messages else 0
        
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
                if recovery_sustained_duration > 10 or (remaining_conv > 0 and recovery_sustained_duration / remaining_conv > 0.2):
                    sustained_recovery = True
                    successful_recoveries = 1
        
        phase_changes = sum(1 for i in range(1, len(phase_timeline)) 
                          if ('conclusion' in phase_timeline[i][1].lower()) != ('conclusion' in phase_timeline[i-1][1].lower()))
        
        outcome = 'no_breakdown'
        has_mystical_breakdown = any('mystical' in str(snapshot.get('analysis', {})).lower() 
                                   for snapshot in analysis_history)
        
        if has_mystical_breakdown or (conclusion_periods and max(conclusion_periods) > 30):
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
            if conclusion_duration > 20 or (total_messages > 0 and conclusion_duration / total_messages > 0.3):
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
                valid = df[df[column] > 0][column]
                stats[placeholder] = round(valid.mean(), 1) if not valid.empty else 0
            elif calc_type == 'std_where_positive':
                valid = df[df[column] > 0][column]
                stats[placeholder] = round(valid.std(), 1) if not valid.empty else 0
            elif calc_type == 'proportion_above_threshold_0.05':
                stats[placeholder] = round(len(df[df[column] > 0.05]) / len(df) * 100, 1)
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

def perform_inferential_tests(df):
    tests = {}
    try:
        breakdown_counts = df['conversation_outcome'].value_counts()
        observed = [
            breakdown_counts.get('breakdown', 0),
            breakdown_counts.get('recovered', 0) + breakdown_counts.get('resisted', 0),
            breakdown_counts.get('no_breakdown', 0)
        ]
        chi2, p = chisquare(observed, f_exp=[len(df)/3]*3)
        tests['breakdown_chi2'] = {'chi2': round(chi2, 2), 'p': round(p, 3)}
    except Exception as e:
        logger.error(f"Error in chi-square test: {e}")
        tests['breakdown_chi2'] = {'chi2': 'N/A', 'p': 'N/A'}
    
    try:
        phase_durations = {
            'breakdown': df[df['conversation_outcome'] == 'breakdown']['phase1_duration'].dropna(),
            'recovered': df[df['conversation_outcome'] == 'recovered']['phase1_duration'].dropna(),
            'resisted': df[df['conversation_outcome'] == 'resisted']['phase1_duration'].dropna(),
            'no_breakdown': df[df['conversation_outcome'] == 'no_breakdown']['phase1_duration'].dropna()
        }
        valid_groups = [group for group in phase_durations.values() if not group.empty]
        if len(valid_groups) >= 2:
            f_stat, p = f_oneway(*valid_groups)
            tests['phase_duration_anova'] = {'f': round(f_stat, 2), 'p': round(p, 3)}
        else:
            tests['phase_duration_anova'] = {'f': 'N/A', 'p': 'N/A'}
    except Exception as e:
        logger.error(f"Error in ANOVA test: {e}")
        tests['phase_duration_anova'] = {'f': 'N/A', 'p': 'N/A'}
    
    return tests

def generate_report(all_metadata, stats, tests):
    """Generate a statistical analysis report."""
    df = pd.DataFrame(all_metadata)
    report_lines = []
    
    report_lines.append("=== Statistical Analysis Report ===")
    report_lines.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"Total Sessions Analyzed: {len(all_metadata)}\n")
    
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
    report_lines.append("")
    
    # Phase Timing
    meta_turns = [m.get('meta_reflection_turn', -1) for m in all_metadata if m.get('meta_reflection_turn', -1) > 0]
    report_lines.append("Phase Timing:")
    if meta_turns:
        report_lines.append(f"  Meta-reflection triggers:")
        report_lines.append(f"    - Mean turn: {stats.get('exponedataMeanBreakdownTurn', 'N/A')}")
        report_lines.append(f"    - Std dev: {stats.get('exponedataStdBreakdownTurn', 'N/A')}")
        report_lines.append(f"    - Range: {min(meta_turns)}-{max(meta_turns)}")
    else:
        report_lines.append("  No meta-reflection triggers detected.")
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
    
    # Recovery Mechanisms
    high_question_density = [m for m in all_metadata if m.get('question_density', 0) > 0.15]
    report_lines.append("Recovery Mechanisms:")
    report_lines.append(f"  High question density (>15%): {len(high_question_density)} conversations")
    for m in all_metadata:
        if m.get('sustained_recovery', 0) == 1 and m.get('question_density', 0) > 0.15:
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
    
    # Statistical Tests
    report_lines.append("Statistical Tests:")
    report_lines.append("  Chi-square test for breakdown occurrence:")
    report_lines.append(f"    - Chi2: {tests.get('breakdown_chi2', {}).get('chi2', 'N/A')}")
    report_lines.append(f"    - p-value: {tests.get('breakdown_chi2', {}).get('p', 'N/A')}")
    report_lines.append("  ANOVA for phase 1 duration across outcomes:")
    report_lines.append(f"    - F: {tests.get('phase_duration_anova', {}).get('f', 'N/A')}")
    report_lines.append(f"    - p-value: {tests.get('phase_duration_anova', {}).get('p', 'N/A')}")
    report_lines.append("")
    
    # Notes
    report_lines.append("Notes:")
    report_lines.append("  - Intervention success metrics are unavailable due to unpopulated manual fields.")
    report_lines.append("  - Regex-based metrics (e.g., meta_reflection_density) require manual validation.")
    report_lines.append("  - Thresholds (e.g., conclusion_periods > 30) should be empirically justified.")
    
    output_file = 'analysis_report.txt'
    with open(output_file, 'w') as f:
        f.write('\n'.join(report_lines))
    logger.info(f"Statistical report saved to: {output_file}")

def parse_and_analyze_json(filepath):
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
    
    analyzer = ConversationAnalyzer()
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
    
    if metadata.get('breakdown_occurred', 0) == 1:
        meta_turn = metadata.get('meta_reflection_turn', -1)
        competitive_turn = metadata.get('competitive_escalation_turn', -1)
        mystical_turn = metadata.get('mystical_breakdown_turn', -1)
        
        if meta_turn > 0:
            metadata['phase1_duration'] = meta_turn
            if competitive_turn > meta_turn:
                metadata['phase2_duration'] = competitive_turn - meta_turn
                metadata['phase3_duration'] = competitive_turn - meta_turn
                if mystical_turn > competitive_turn:
                    metadata['phase4_duration'] = mystical_turn - competitive_turn
                    metadata['phase5_duration'] = metadata['total_messages'] - mystical_turn
    
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

def process_directory(directory='.'):
    json_files = sorted(Path(directory).glob('Consciousness_Exploration_*.json'))
    
    if not json_files:
        logger.warning("No matching JSON files found!")
        return
    
    all_metadata = []
    
    for filepath in json_files:
        try:
            logger.info(f"Processing: {filepath.name}")
            metadata = parse_and_analyze_json(filepath)
            if metadata:
                all_metadata.append(metadata)
        except Exception as e:
            logger.error(f"Error processing {filepath.name}: {e}")
            import traceback
            traceback.print_exc()
    
    fieldnames = [
        'filename', 'session_id', 'duration_minutes', 'total_messages', 'total_participants',
        'participant_1', 'participant_2', 'participant_3', 'moderator_messages',
        'claude_messages', 'gpt_messages', 'grok_messages', 'created_at', 'updated_at',
        'duration_seconds', 'error_count', 'analysis_count', 'template',
        'conversation_outcome', 'termination_type', 'breakdown_occurred', 'breakdown_confidence',
        'time_to_breakdown', 'current_breakdown_phase', 'meta_reflection_turn',
        'competitive_escalation_turn', 'mystical_breakdown_turn', 'phase1_duration',
        'phase2_duration', 'phase3_duration', 'phase4_duration', 'phase5_duration',
        'recovery_attempts', 'successful_recoveries', 'sustained_recovery',
        'recovery_sustained_duration', 'avg_recovery_duration', 'phase_oscillations',
        'total_conclusion_turns', 'total_non_conclusion_turns', 'conclusion_percentage',
        'longest_conclusion_period', 'longest_non_conclusion_period', 'first_meta_reflection_turn',
        'total_meta_reflections', 'meta_reflection_density', 'closure_vibe_count',
        'first_closure_vibe_turn', 'mystical_language_count', 'mystical_density',
        'recovery_attempt_count', 'peer_mirroring_count', 'mirroring_coefficient',
        'avg_response_latency', 'grandiosity_escalation', 'abstract_language_score',
        'mean_forward_ratio', 'question_density', 'ritual_planning_mentions',
        'community_building_mentions', 'prevention_content_present', 'dominant_phase',
        'phase_sequence', 'phase_transitions', 'reached_conclusion', 'conclusion_turn',
        'conclusion_duration', 'escaped_conclusion', 'stuck_in_conclusion', 'conclusion_loops',
        'has_transcendent_conclusion', 'has_integration_conclusion', 'conclusion_subtypes',
        'closure_language_in_analysis', 'first_closure_indicator_turn',
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
    
    # Perform statistical analysis and generate report
    df = pd.DataFrame(all_metadata)
    stats = compute_statistics(df, mapping)
    tests = perform_inferential_tests(df)
    generate_report(all_metadata, stats, tests)

if __name__ == "__main__":
    process_directory()
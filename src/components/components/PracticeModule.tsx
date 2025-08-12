import QuizRenderer from './QuizRenderer';
import { questions } from '../data';

export default function PracticeModule() {
  return <QuizRenderer data={questions} />;
}

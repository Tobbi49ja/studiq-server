import { summariseNotes, generateQuiz } from './ai.js'

const testText = `Alkanes are saturated hydrocarbons with general formula CnH2n+2. 
Methane (CH4) is the simplest alkane. They undergo substitution reactions with halogens 
under UV light. Alkenes are unsaturated with double bonds, general formula CnH2n, 
and undergo addition reactions.`

const summary = await summariseNotes(testText)
console.log('SUMMARY:', JSON.stringify(summary, null, 2))

const quiz = await generateQuiz(summary.summary, summary.topics, 3)
console.log('QUIZ:', JSON.stringify(quiz, null, 2))

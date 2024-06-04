import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function requireConfirmation(): Promise<void> {
  return new Promise((resolve, reject) => {
    rl.question('Please type "yes" or "no" (y/n) to confirm: ', (answer) => {
      const formattedAnswer = answer.trim().toLowerCase();
      if (formattedAnswer === 'yes' || formattedAnswer === 'y') {
        console.log('Confirmation received!');
        rl.close();
        resolve();
      } else if (formattedAnswer === 'no' || formattedAnswer === 'n') {
        console.log('Confirmation denied.');
        rl.close();
        process.exit(1);
      } else {
        console.log(
          'Invalid input. Please type "yes" or "no" (y/n) to confirm.'
        );
        requireConfirmation().then(resolve).catch(reject); // Ask again
      }
    });
  });
}

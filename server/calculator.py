import sys

class Calculator:
    def __init__(self):
        self.current_value = "0"
        self.first_operand = None
        self.operator = None
        self.waiting_for_second_operand = False

    def add(self, digit):
        if self.current_value == "0" or self.waiting_for_second_operand:
            self.current_value = str(digit)
            self.waiting_for_second_operand = False
        else:
            self.current_value += str(digit)

    def set_operator(self, operator):
        try:
            self.first_operand = float(self.current_value)
        except ValueError:
            print("Error: Invalid number")
            return

        self.operator = operator
        self.waiting_for_second_operand = True

    def calculate(self):
        if self.operator is None or self.first_operand is None:
            return self.current_value

        try:
            second_operand = float(self.current_value)
            if self.operator == '+':
                result = self.first_operand + second_operand
            elif self.operator == '-':
                result = self.first_operand - second_operand
            elif self.operator == '*':
                result = self.first_operand * second_operand
            elif self.operator == '/':
                if second_operand == 0:
                    return "Error: Div by 0"
                result = self.first_operand / second_operand
            else:
                return "Error: Invalid Op"
            
            # Format result to remove .0 if it's an integer
            if result == int(result):
                self.current_value = str(int(result))
            else:
                self.current_value = str(round(result, 4))
                
        except ValueError:
            self.current_value = "Error"
        
        self.operator = None
        self.first_operand = None
        self.waiting_for_second_operand = False
        return self.current_value

    def clear(self):
        self.current_value = "0"
        self.first_operand = None
        self.operator = None
        self.waiting_for_second_operand = False

def draw_calculator(calc):
    print("\n" + "="*20)
    print(f"| {calc.current_value:>18} |")
    print("="*20)
    print("| 7 | 8 | 9 | / |")
    print("| 4 | 5 | 6 | * |")
    print("| 1 | 2 | 3 | - |")
    print("| C | 0 | = | + |")
    print("="*20)

def main():
    calc = Calculator()
    print("Welcome to the CLI Calculator!")
    print("Commands: digits (0-9), operators (+, -, *, /), 'c' for clear, '=' for result, 'q' to quit")
    
    while True:
        draw_calculator(calc)
        user_input = input("Input: ").strip().lower()
        
        if user_input == 'q':
            break
        elif user_input == 'c':
            calc.clear()
        elif user_input == '=':
            calc.calculate()
        elif user_input in ('+', '-', '*', '/'):
            calc.set_operator(user_input)
        elif user_input.isdigit():
            # Handle multiple digits at once if entered (e.g., "123")
            for digit in user_input:
                calc.add(digit)
        else:
            print("Invalid input!")

if __name__ == "__main__":
    main()

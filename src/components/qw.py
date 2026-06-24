def sum_of_n_natural_numbers(n):
    """Calculate the sum of the first n natural numbers."""
    return n * (n + 1) // 2

if __name__ == "__main__":
    try:
        n = int(input("Enter a positive integer n: "))
        if n < 0:
            print("Please enter a positive integer.")
        else:
            result = sum_of_n_natural_numbers(n)
            print(f"The sum of the first {n} natural numbers is: {result}")
    except ValueError:
        print("Invalid input. Please enter a valid integer.")

declare namespace jest {
  interface It {
    if: (condition: boolean) => jest.It;
    ifWindows: jest.It;
    ifNotWindows: jest.It;
  }
}

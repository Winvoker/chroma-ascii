export const BayerMatrix4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
];

export function getBayerValue(x, y) {
    return BayerMatrix4x4[y % 4][x % 4];
}

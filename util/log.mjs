import colors from 'colors';

const sourceColors = {};

function zeroPad(number, length) {
	number = number.toString();

	return number.length >= length ? number : new Array(length - number.length + 1).join("0") + number;
}

function colorize(source) {
	if(sourceColors[source])
		return colors[sourceColors[source]](source);

	return false;
}

function format(source, message, color) {
	const d = new Date();

	console.log((zeroPad(d.getHours(), 2) + ":" + zeroPad(d.getMinutes(), 2) + ":" + zeroPad(d.getSeconds(), 2) + " ").magenta + "[".grey + (colorize(source) || source.white) + "]".grey + " "[color || "white"] + message);
}

export default {
	setSourceColor(source, color) {
		if(String.prototype[color])
			sourceColors[source] = color;
	},
	info(source, message) {
		format(source, message);
	},
	debug(source, message) {
		format(source, message, "grey");
	},
	warn(source, message) {
		format(source, message, "yellow");
	},
	error(source, message) {
		format(source, message, "red");
	}
};

//------- utils to deal with ArrayBuffer
//
export const base64toHEX = base64 => {
  var raw = atob(base64);
  var HEX = '';

  for ( i = 0; i < raw.length; i++ ) {
    var _hex = raw.charCodeAt(i).toString(16)
    HEX += (_hex.length==2?_hex:'0'+_hex);
  }
  return HEX.toUpperCase();
}

export const toByteArray = hexString => {
  var result = [];
  while (hexString.length >= 2) {
    result.push(parseInt(hexString.substring(0, 2), 16));
    hexString = hexString.substring(2, hexString.length);
  }
  return result;
}

export const pack = bytes => {
    var str = "";
    for(var i = 0; i < bytes.length; i += 2) {
        var char = bytes[i] << 8;
        if (bytes[i + 1])
            char |= bytes[i + 1];
        str += String.fromCharCode(char);
    }
    return str;
}

export const stringToAsciiByteArray = str => {
    var bytes = [];
   for (var i = 0; i < str.length; ++i)
   {
       var charCode = str.charCodeAt(i);
      if (charCode > 0xFF)  // char > 1 byte since charCodeAt returns the UTF-16 value
      {
          throw new Error('Character ' + String.fromCharCode(charCode) + ' can\'t be represented by a US-ASCII byte.');
      }
       bytes.push(charCode);
   }
    return bytes;
}
//------- 